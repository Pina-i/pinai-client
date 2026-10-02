//! Pina'i `openmls` WASM bundle.
//!
//! Wraps the minimal MLS surface the web client uses, with a strict
//! bytes-in / bytes-out boundary so JS can persist every cryptographic
//! object as an opaque blob in IndexedDB.
//!
//! ## API surface
//!
//! - [`Provider`] — wraps `OpenMlsRustCrypto` (in-memory keystore + RNG +
//!   crypto primitives). Held by JS for the lifetime of a session.
//! - [`Identity`] — Ed25519 signature keypair + `BasicCredential`. One per
//!   *device*: the user's MSK is generated separately and signs the leaf.
//! - [`KeyPackage`] — single-use bundle uploaded to the IdP key directory.
//! - [`Group`] — wraps `MlsGroup`. Owns commit / welcome / application
//!   message production and consumption. Built around the strict-state
//!   "merge_pending_commit after delivery" pattern from RFC 9420.
//!
//! ## Persistence
//!
//! `OpenMlsRustCrypto` is in-memory by default. The web client will
//! snapshot the underlying storage to IndexedDB on every successful
//! operation (encrypted at rest by a non-extractable Web Crypto key).
//! The wrapper itself stays stateless across reloads — JS rebuilds a
//! `Provider` and re-hydrates groups via `Group::load` (added in 4b
//! when we're sure of the IndexedDB schema).
//!
//! ## Wire format
//!
//! Every method that crosses the JS boundary takes / returns
//! `Vec<u8>` (which `wasm-bindgen` translates to `Uint8Array`).
//! Serialisation is `tls_codec` everywhere — the same format used on the
//! IdP wire (see `identity-provider/specs/e2ee.md § 5`), so the same bytes that come off
//! `direct_messages.mls_ciphertext` feed straight into
//! [`Group::process_message`].

use openmls::{
    credentials::{BasicCredential, CredentialWithKey},
    framing::{MlsMessageBodyIn, MlsMessageIn, MlsMessageOut, ProcessedMessageContent},
    group::{GroupId, MlsGroup, MlsGroupJoinConfig, StagedWelcome},
    key_packages::{KeyPackage as OpenMlsKeyPackage, KeyPackageIn},
    messages::Welcome,
    prelude::{LeafNodeIndex, LeafNodeParameters, ProtocolVersion, SignatureScheme},
    treesync::RatchetTreeIn,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::{types::Ciphersuite, OpenMlsProvider};
use tls_codec::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

fn welcome_in(welcome_bytes: &[u8]) -> Result<Welcome, JsError> {
    let mut s = welcome_bytes;
    let msg = MlsMessageIn::tls_deserialize(&mut s)
        .map_err(|e| JsError::new(&format!("Welcome deserialize failed: {e}")))?;
    match msg.extract() {
        MlsMessageBodyIn::Welcome(w) => Ok(w),
        other => Err(JsError::new(&format!(
            "Expected Welcome message, got {other:?}"
        ))),
    }
}

/// One-shot init. Mounts the panic hook so dev-tools see a real Rust
/// stack trace instead of `unreachable executed`.
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Single ciphersuite — pinned to keep the WASM bundle small and to
/// avoid a runtime negotiation step. X25519 + ChaCha20Poly1305 + SHA256
/// + Ed25519 is RFC 9420's mandatory-to-implement suite and the same one
/// the openmls reference WASM example pins.
const CIPHERSUITE: Ciphersuite =
    Ciphersuite::MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519;

// ─── Provider ────────────────────────────────────────────────────────────────

/// Crypto + storage backend handle. Construct once per session; pass the
/// same instance to every `Group` operation.
#[wasm_bindgen]
#[derive(Default)]
pub struct Provider(OpenMlsRustCrypto);

impl AsRef<OpenMlsRustCrypto> for Provider {
    fn as_ref(&self) -> &OpenMlsRustCrypto {
        &self.0
    }
}

impl AsMut<OpenMlsRustCrypto> for Provider {
    fn as_mut(&mut self) -> &mut OpenMlsRustCrypto {
        &mut self.0
    }
}

#[wasm_bindgen]
impl Provider {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Snapshot the provider's MLS storage to an opaque byte string
    /// suitable for at-rest persistence. The format is length-
    /// prefixed `(key, value)` pairs over the underlying
    /// `MemoryStorage` HashMap — internal to this wrapper, not
    /// stable across openmls versions. Pair every snapshot with the
    /// list of known group ids (the JS layer holds those) so
    /// rehydration knows which groups to `Group::load`.
    pub fn serialize_storage(&self) -> Result<Vec<u8>, JsError> {
        let storage = self.0.storage();
        let values = storage
            .values
            .read()
            .map_err(|e| JsError::new(&format!("storage poisoned: {e}")))?;

        // Header: u64 entry count, then for each entry: u64 key len,
        // u64 value len, key bytes, value bytes. Big-endian everywhere
        // for cross-arch parity (the bytes only ever round-trip
        // through the same browser, but be principled).
        let mut out: Vec<u8> = Vec::with_capacity(8 + values.len() * 64);
        out.extend_from_slice(&(values.len() as u64).to_be_bytes());
        for (k, v) in values.iter() {
            out.extend_from_slice(&(k.len() as u64).to_be_bytes());
            out.extend_from_slice(&(v.len() as u64).to_be_bytes());
            out.extend_from_slice(k);
            out.extend_from_slice(v);
        }
        Ok(out)
    }

    /// Restore a snapshot previously produced by
    /// [`Provider::serialize_storage`]. Replaces the existing
    /// storage contents wholesale; safe to call on a fresh
    /// `Provider` to rehydrate after a page reload.
    pub fn deserialize_storage(&self, bytes: &[u8]) -> Result<(), JsError> {
        let mut new_map: std::collections::HashMap<Vec<u8>, Vec<u8>> =
            std::collections::HashMap::new();
        let mut cursor = 0usize;
        if bytes.len() < 8 {
            return Err(JsError::new("storage snapshot truncated"));
        }
        let count = u64::from_be_bytes(
            bytes[cursor..cursor + 8]
                .try_into()
                .map_err(|_| JsError::new("storage snapshot count read failed"))?,
        ) as usize;
        cursor += 8;

        for _ in 0..count {
            if cursor + 16 > bytes.len() {
                return Err(JsError::new("storage snapshot lengths read past EOF"));
            }
            let k_len = u64::from_be_bytes(bytes[cursor..cursor + 8].try_into().unwrap()) as usize;
            let v_len =
                u64::from_be_bytes(bytes[cursor + 8..cursor + 16].try_into().unwrap()) as usize;
            cursor += 16;
            if cursor + k_len + v_len > bytes.len() {
                return Err(JsError::new("storage snapshot data read past EOF"));
            }
            let k = bytes[cursor..cursor + k_len].to_vec();
            cursor += k_len;
            let v = bytes[cursor..cursor + v_len].to_vec();
            cursor += v_len;
            new_map.insert(k, v);
        }

        let storage = self.0.storage();
        let mut values = storage
            .values
            .write()
            .map_err(|e| JsError::new(&format!("storage poisoned: {e}")))?;
        *values = new_map;
        Ok(())
    }
}

// ─── Identity ────────────────────────────────────────────────────────────────

/// Per-device signature key + MLS credential. The credential carries the
/// `actor_uri` so receivers can map a leaf back to its IdP user.
///
/// The actual `SignatureKeyPair` lives in the provider's storage —
/// holding it directly on this struct exhibited a release-build /
/// wasm-bindgen interaction where the keypair's `signature_scheme` and
/// `public/private` byte buffers got zeroed between `Identity::new`
/// and a later `&self` call (`key_package`, `Group::add_member`, etc.).
/// Keeping only the public-key bytes + scheme tag and re-reading the
/// keypair from `provider.storage()` on demand sidesteps the issue
/// entirely without changing the on-the-wire shape.
#[wasm_bindgen]
pub struct Identity {
    credential_with_key: CredentialWithKey,
    signature_public_key: Vec<u8>,
    /// Plain `u16` rather than `SignatureScheme` so the discriminant
    /// can never be transmuted from a zeroed byte and read as an
    /// invalid variant.
    signature_scheme_repr: u16,
}

impl Identity {
    /// Look up the per-device signature keypair that
    /// [`Identity::new`] stashed in the provider's storage. Returns
    /// a fresh `SignatureKeyPair` value — short-lived, lives only
    /// for the duration of the caller, never crosses the
    /// wasm-bindgen boundary.
    fn signer(&self, provider: &Provider) -> Result<SignatureKeyPair, JsError> {
        let scheme = SignatureScheme::try_from(self.signature_scheme_repr).map_err(|e| {
            JsError::new(&format!(
                "Identity has invalid signature scheme repr 0x{:04x}: {e}",
                self.signature_scheme_repr,
            ))
        })?;
        SignatureKeyPair::read(provider.0.storage(), &self.signature_public_key, scheme)
            .ok_or_else(|| {
                JsError::new(
                    "Identity signature keypair missing from provider storage; the provider \
                     likely lost state across a snapshot round-trip without a matching \
                     setIdentity call",
                )
            })
    }
}

#[wasm_bindgen]
impl Identity {
    /// Generate a fresh leaf-signature keypair and bind it to the given
    /// `identity` blob. The web client passes the user's `actor_uri` here
    /// so cross-IdP recipients see a stable identifier in each leaf.
    #[wasm_bindgen(constructor)]
    pub fn new(provider: &Provider, identity: &[u8]) -> Result<Identity, JsError> {
        let credential = BasicCredential::new(identity.to_vec());
        let keypair = SignatureKeyPair::new(SignatureScheme::ED25519)
            .map_err(|e| JsError::new(&format!("Identity keypair gen failed: {e}")))?;
        keypair
            .store(provider.0.storage())
            .map_err(|e| JsError::new(&format!("Identity keypair store failed: {e}")))?;
        let signature_public_key = keypair.public().to_vec();
        let credential_with_key = CredentialWithKey {
            credential: credential.into(),
            signature_key: signature_public_key.clone().into(),
        };
        // The keypair itself is intentionally dropped here — the
        // canonical copy lives in `provider.storage()` from now on.
        // See the `signer()` helper above.
        drop(keypair);
        Ok(Identity {
            credential_with_key,
            signature_public_key,
            signature_scheme_repr: SignatureScheme::ED25519 as u16,
        })
    }

    /// Rebind an existing leaf-signature keypair that already lives in
    /// `provider.storage()` — typically because a snapshot was just
    /// restored. Unlike [`Identity::new`] this does **not** generate a
    /// fresh keypair: it looks up the one indexed by the supplied
    /// `signature_public_key` and wires it into a fresh `Identity`. The
    /// caller is expected to recover the public key from a restored
    /// `Group`'s leaf credential (matching the device's `actor_uri` +
    /// `device_id`) so that subsequent encrypts continue to sign with
    /// the same key the recipient already has in its tree.
    ///
    /// Errors if no matching keypair is in provider storage — that
    /// indicates the snapshot didn't include the keypair, so falling
    /// back to [`Identity::new`] is the only safe move.
    pub fn restore(
        provider: &Provider,
        identity: &[u8],
        signature_public_key: Vec<u8>,
    ) -> Result<Identity, JsError> {
        let scheme = SignatureScheme::ED25519;
        // Verify the keypair is actually in storage before handing back
        // an Identity — `signer()` would surface this later, but
        // failing fast here gives the caller a clean signal to fall
        // back to fresh-key generation.
        let _exists = SignatureKeyPair::read(provider.0.storage(), &signature_public_key, scheme)
            .ok_or_else(|| {
                JsError::new(
                    "Identity::restore: no keypair in provider storage for the supplied \
                     signature_public_key — caller should fall back to Identity::new",
                )
            })?;
        let credential = BasicCredential::new(identity.to_vec());
        let credential_with_key = CredentialWithKey {
            credential: credential.into(),
            signature_key: signature_public_key.clone().into(),
        };
        Ok(Identity {
            credential_with_key,
            signature_public_key,
            signature_scheme_repr: scheme as u16,
        })
    }

    /// Build a fresh single-use KeyPackage for upload to the IdP key
    /// directory. Caller is responsible for batching these into the
    /// `POST /api/keys/packages` payload.
    pub fn key_package(&self, provider: &Provider) -> Result<KeyPackage, JsError> {
        let signer = self.signer(provider)?;
        let kp = OpenMlsKeyPackage::builder()
            .build(
                CIPHERSUITE,
                &provider.0,
                &signer,
                self.credential_with_key.clone(),
            )
            .map_err(|e| JsError::new(&format!("KeyPackage build failed: {e}")))?;
        Ok(KeyPackage(kp.key_package().clone()))
    }

    /// The Ed25519 public key bytes — used for fingerprinting in the UI.
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.signature_public_key.clone()
    }
}

// ─── KeyPackage ──────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub struct KeyPackage(OpenMlsKeyPackage);

#[wasm_bindgen]
impl KeyPackage {
    /// TLS-encoded for upload to the IdP / cross-IdP claim.
    pub fn to_bytes(&self) -> Result<Vec<u8>, JsError> {
        self.0
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("KeyPackage serialize failed: {e}")))
    }

    /// Validate and parse a TLS-encoded KeyPackage fetched from the IdP.
    /// Validation enforces protocol version + ciphersuite + signature.
    pub fn from_bytes(bytes: &[u8]) -> Result<KeyPackage, JsError> {
        let mut s = bytes;
        let kp_in = KeyPackageIn::tls_deserialize(&mut s)
            .map_err(|e| JsError::new(&format!("KeyPackage deserialize failed: {e}")))?;
        let kp = kp_in
            .validate(
                &openmls_rust_crypto::RustCrypto::default(),
                ProtocolVersion::Mls10,
            )
            .map_err(|e| JsError::new(&format!("KeyPackage validation failed: {e:?}")))?;
        Ok(KeyPackage(kp))
    }
}

// ─── Outputs of group ops ────────────────────────────────────────────────────

/// Result of an `add_member` call. JS routes:
/// - `commit` → `POST /api/mls/groups/:id/commits`
/// - `welcome` → cross-IdP `Create{Note}` with `mlsKind: welcome` (or local
///   `mls_welcomes` insert via the IdP REST surface).
#[wasm_bindgen]
pub struct AddOutput {
    commit: Vec<u8>,
    welcome: Vec<u8>,
}

#[wasm_bindgen]
impl AddOutput {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn welcome(&self) -> Vec<u8> {
        self.welcome.clone()
    }
}

/// Commit-only output for `remove_member` and `update`.
#[wasm_bindgen]
pub struct CommitOutput {
    commit: Vec<u8>,
}

#[wasm_bindgen]
impl CommitOutput {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }
}

/// One leaf in the MLS tree. Returned by [`Group::list_members`] —
/// the JS layer parses `credential_bytes` back into its
/// `(actor_uri, device_id)` JSON shape to find the leaf for a
/// specific device when revoking.
#[wasm_bindgen]
pub struct GroupMember {
    leaf_index: u32,
    credential_bytes: Vec<u8>,
    signature_public_key: Vec<u8>,
}

#[wasm_bindgen]
impl GroupMember {
    #[wasm_bindgen(getter)]
    pub fn leaf_index(&self) -> u32 {
        self.leaf_index
    }
    #[wasm_bindgen(getter)]
    pub fn credential_bytes(&self) -> Vec<u8> {
        self.credential_bytes.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.signature_public_key.clone()
    }
}

/// Categorises the outcome of `Group::process_message` so JS can route
/// the result without inspecting MLS internals. Mirrors openmls's
/// `ProcessedMessageContent`.
#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProcessedKind {
    /// An application message decrypted to plaintext; bytes carried in
    /// [`ProcessedMessage::application`].
    Application,
    /// A staged proposal was buffered into the group's pending state.
    Proposal,
    /// A staged commit was merged immediately. Group state advanced
    /// to the next epoch.
    Commit,
}

#[wasm_bindgen]
pub struct ProcessedMessage {
    kind: ProcessedKind,
    application: Vec<u8>,
}

#[wasm_bindgen]
impl ProcessedMessage {
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> ProcessedKind {
        self.kind
    }
    /// The decrypted plaintext when `kind == Application`. Empty otherwise.
    #[wasm_bindgen(getter)]
    pub fn application(&self) -> Vec<u8> {
        self.application.clone()
    }
}

// ─── Group ───────────────────────────────────────────────────────────────────

/// MLS group state for one conversation. The IdP's `conversation_id`
/// (UUID) is what's passed as `group_id` so server and client agree on
/// the mapping.
#[wasm_bindgen]
pub struct Group {
    mls_group: MlsGroup,
}

#[wasm_bindgen]
impl Group {
    /// Create a brand-new group. The founder is automatically the only
    /// member. To bring in others, call [`Group::add_member`] and dispatch
    /// the resulting `welcome` to each.
    pub fn create_new(
        provider: &Provider,
        founder: &Identity,
        group_id: &[u8],
    ) -> Result<Group, JsError> {
        let signer = founder.signer(provider)?;
        let mls_group = MlsGroup::builder()
            .ciphersuite(CIPHERSUITE)
            // We don't ship the ratchet tree in welcomes; the joiner
            // fetches it via `export_ratchet_tree` from an existing
            // member or from a server-side cache. Phase 4b will pick.
            .use_ratchet_tree_extension(true)
            .with_group_id(GroupId::from_slice(group_id))
            .build(
                &provider.0,
                &signer,
                founder.credential_with_key.clone(),
            )
            .map_err(|e| JsError::new(&format!("Group create failed: {e}")))?;
        Ok(Group { mls_group })
    }

    /// Re-hydrate a group from the provider's persisted storage —
    /// used after a page reload, once
    /// [`Provider::deserialize_storage`] has restored the underlying
    /// MLS state. Returns `None` when the provider doesn't hold a
    /// group with the given id (the JS layer falls through to a
    /// fresh-group bootstrap or pulls the welcome again).
    pub fn load_from_provider(
        provider: &Provider,
        group_id: &[u8],
    ) -> Result<Option<Group>, JsError> {
        let id = GroupId::from_slice(group_id);
        let opt = MlsGroup::load(provider.0.storage(), &id)
            .map_err(|e| JsError::new(&format!("Group::load failed: {e:?}")))?;
        Ok(opt.map(|mls_group| Group { mls_group }))
    }

    /// Build a group from a Welcome we received. The ratchet tree must
    /// match what the inviter committed — Phase 4b passes the bytes
    /// alongside the welcome.
    pub fn join(
        provider: &Provider,
        welcome_bytes: &[u8],
        ratchet_tree_bytes: Option<Vec<u8>>,
    ) -> Result<Group, JsError> {
        let welcome = welcome_in(welcome_bytes)?;
        let ratchet_tree = match ratchet_tree_bytes {
            Some(bytes) => {
                let mut s = bytes.as_slice();
                Some(RatchetTreeIn::tls_deserialize(&mut s).map_err(|e| {
                    JsError::new(&format!("RatchetTree deserialize failed: {e}"))
                })?)
            }
            None => None,
        };

        let config = MlsGroupJoinConfig::builder().build();
        let staged = StagedWelcome::new_from_welcome(&provider.0, &config, welcome, ratchet_tree)
            .map_err(|e| JsError::new(&format!("StagedWelcome failed: {e}")))?;
        let mls_group = staged
            .into_group(&provider.0)
            .map_err(|e| JsError::new(&format!("Group join failed: {e}")))?;

        Ok(Group { mls_group })
    }

    /// Join again from a Welcome for this group — the device was committed out and added back.
    /// The group held is replaced only when the Welcome brings a later epoch; `None` keeps it, as
    /// for a Welcome from a group both sides founded at once.
    pub fn rejoin(
        &mut self,
        provider: &Provider,
        welcome_bytes: &[u8],
    ) -> Result<Option<Group>, JsError> {
        let config = MlsGroupJoinConfig::builder().build();
        let welcome = welcome_in(welcome_bytes)?;
        let staged = StagedWelcome::build_from_welcome(&provider.0, &config, welcome)
            .and_then(|join| join.replace_old_group().build())
            .map_err(|e| JsError::new(&format!("StagedWelcome failed: {e}")))?;
        if staged.group_context().group_id() != self.mls_group.group_id()
            || staged.group_context().epoch() <= self.mls_group.epoch()
        {
            return Ok(None);
        }
        // Deleted first: the new group's state lands under the same keys, and an old epoch's
        // keys would otherwise stay behind.
        self.delete(provider)?;
        let mls_group = staged
            .into_group(&provider.0)
            .map_err(|e| JsError::new(&format!("Group join failed: {e}")))?;
        Ok(Some(Group { mls_group }))
    }

    /// Remove the group's state from the provider, as a group the user was removed from is cleared.
    pub fn delete(&mut self, provider: &Provider) -> Result<(), JsError> {
        self.mls_group
            .delete(provider.0.storage())
            .map_err(|e| JsError::new(&format!("Group delete failed: {e:?}")))
    }

    /// The keypair of the group's own leaf, which peers verify this device's messages and commits
    /// against — not necessarily the identity bound since: a KeyPackage published before a reload
    /// carries the key of its day.
    fn signer(&self, provider: &Provider) -> Result<SignatureKeyPair, JsError> {
        let leaf = self
            .mls_group
            .own_leaf_node()
            .ok_or_else(|| JsError::new("The group holds no leaf of this device"))?;
        SignatureKeyPair::read(
            provider.0.storage(),
            leaf.signature_key().as_slice(),
            SignatureScheme::ED25519,
        )
        .ok_or_else(|| JsError::new("The signing keypair of this device's leaf is missing from storage"))
    }

    /// Serialise the ratchet tree so a joining client can rebuild group
    /// state alongside its Welcome. The plan ships this inline with the
    /// Welcome envelope (it's not separately confidential — it's
    /// redacted-by-design).
    pub fn export_ratchet_tree(&self) -> Result<Vec<u8>, JsError> {
        let tree = self.mls_group.export_ratchet_tree();
        // `RatchetTree` serialises directly; `RatchetTreeIn` is the parse
        // half. The two share `tls_codec` representation.
        let mut out = vec![];
        tree.tls_serialize(&mut out)
            .map_err(|e| JsError::new(&format!("RatchetTree serialize failed: {e}")))?;
        Ok(out)
    }

    /// Enumerate every active leaf in the group. Each entry carries
    /// the leaf's index (used by [`Group::remove_member`]) and the
    /// raw credential bytes (parsed by JS to recover its
    /// `(actor_uri, device_id)` shape).
    pub fn list_members(&self) -> Vec<GroupMember> {
        self.mls_group
            .members()
            .map(|m| GroupMember {
                leaf_index: m.index.u32(),
                credential_bytes: m.credential.serialized_content().to_vec(),
                signature_public_key: m.signature_key,
            })
            .collect()
    }

    /// The numeric group epoch — used by the IdP DS to enforce a strict
    /// total order. Increments on each merged commit.
    pub fn epoch(&self) -> u64 {
        self.mls_group.epoch().as_u64()
    }

    /// Add a member to the group. Produces one Commit (broadcast to
    /// existing members) and one Welcome (sent to the new member).
    /// The pending commit is **not** merged — call
    /// [`Group::merge_pending_commit`] only after the IdP DS
    /// acknowledged the commit at the right epoch.
    pub fn add_member(
        &mut self,
        provider: &Provider,
        new_member_kp: &KeyPackage,
    ) -> Result<AddOutput, JsError> {
        let signer = self.signer(provider)?;
        let (commit_msg, welcome_msg, _group_info) = self
            .mls_group
            .add_members(&provider.0, &signer, &[new_member_kp.0.clone()])
            .map_err(|e| JsError::new(&format!("add_members failed: {e}")))?;
        Ok(AddOutput {
            commit: serialize_message(&commit_msg)?,
            welcome: serialize_message(&welcome_msg)?,
        })
    }

    /// Remove the leaf at `member_index`. JS gets the index from
    /// `Group::list_members` (added in 4b) keyed by leaf credential.
    pub fn remove_member(
        &mut self,
        provider: &Provider,
        member_index: u32,
    ) -> Result<CommitOutput, JsError> {
        let signer = self.signer(provider)?;
        let (commit_msg, _welcome, _group_info) = self
            .mls_group
            .remove_members(
                &provider.0,
                &signer,
                &[LeafNodeIndex::new(member_index)],
            )
            .map_err(|e| JsError::new(&format!("remove_members failed: {e}")))?;
        Ok(CommitOutput {
            commit: serialize_message(&commit_msg)?,
        })
    }

    /// Self-update — rotates the caller's leaf key for post-compromise
    /// security. Generates one Commit; no Welcome.
    pub fn update(
        &mut self,
        provider: &Provider,
    ) -> Result<CommitOutput, JsError> {
        let signer = self.signer(provider)?;
        let commit_bundle = self
            .mls_group
            .self_update(&provider.0, &signer, LeafNodeParameters::default())
            .map_err(|e| JsError::new(&format!("self_update failed: {e}")))?;
        Ok(CommitOutput {
            commit: serialize_message(&commit_bundle.into_messages().0)?,
        })
    }

    /// Merge the pending commit (the one we built locally for `add_member`,
    /// `remove_member`, or `update`). Call only after the IdP DS confirmed
    /// our commit landed at the proposed epoch.
    pub fn merge_pending_commit(&mut self, provider: &mut Provider) -> Result<(), JsError> {
        self.mls_group
            .merge_pending_commit(&provider.0)
            .map_err(|e| JsError::new(&format!("merge_pending_commit failed: {e}")))
    }

    /// Drop the pending commit — one the IdP DS refused or never acknowledged. The group builds no
    /// other commit while one is pending.
    pub fn clear_pending_commit(&mut self, provider: &mut Provider) -> Result<(), JsError> {
        self.mls_group
            .clear_pending_commit(provider.0.storage())
            .map_err(|e| JsError::new(&format!("clear_pending_commit failed: {e:?}")))
    }

    /// Encrypt an application message (text DM, reaction, edit — the
    /// kind-byte lives inside `plaintext`).
    pub fn encrypt_application(
        &mut self,
        provider: &Provider,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, JsError> {
        let signer = self.signer(provider)?;
        let msg = self
            .mls_group
            .create_message(&provider.0, &signer, plaintext)
            .map_err(|e| JsError::new(&format!("create_message failed: {e}")))?;
        serialize_message(&msg)
    }

    /// Process any inbound MLS message — application, proposal, or commit.
    /// Application messages return their plaintext. Commits are merged
    /// in-place and advance the group epoch. Proposals are staged into
    /// pending state.
    pub fn process_message(
        &mut self,
        provider: &mut Provider,
        msg_bytes: &[u8],
    ) -> Result<ProcessedMessage, JsError> {
        let mut s = msg_bytes;
        let msg_in = MlsMessageIn::tls_deserialize(&mut s)
            .map_err(|e| JsError::new(&format!("MLS message deserialize failed: {e}")))?;

        let processed = match msg_in.extract() {
            MlsMessageBodyIn::PrivateMessage(m) => self
                .mls_group
                .process_message(&provider.0, m)
                .map_err(|e| JsError::new(&format!("process PrivateMessage failed: {e}")))?,
            MlsMessageBodyIn::PublicMessage(m) => self
                .mls_group
                .process_message(&provider.0, m)
                .map_err(|e| JsError::new(&format!("process PublicMessage failed: {e}")))?,
            other => {
                return Err(JsError::new(&format!(
                    "Unexpected message body for process_message: {other:?}"
                )))
            }
        };

        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(app) => Ok(ProcessedMessage {
                kind: ProcessedKind::Application,
                application: app.into_bytes(),
            }),
            ProcessedMessageContent::ProposalMessage(proposal)
            | ProcessedMessageContent::ExternalJoinProposalMessage(proposal) => {
                self.mls_group
                    .store_pending_proposal(provider.0.storage(), *proposal)
                    .map_err(|e| {
                        JsError::new(&format!("store_pending_proposal failed: {e}"))
                    })?;
                Ok(ProcessedMessage {
                    kind: ProcessedKind::Proposal,
                    application: vec![],
                })
            }
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                self.mls_group
                    .merge_staged_commit(&provider.0, *staged)
                    .map_err(|e| JsError::new(&format!("merge_staged_commit failed: {e}")))?;
                Ok(ProcessedMessage {
                    kind: ProcessedKind::Commit,
                    application: vec![],
                })
            }
        }
    }

    /// Derive a `key_length`-byte secret bound to `(label, context)` from
    /// the current epoch. Used by Phase 4b's per-attachment key derivation
    /// when we don't want to inline a fresh AES key in every send.
    pub fn export_secret(
        &self,
        provider: &Provider,
        label: &str,
        context: &[u8],
        key_length: usize,
    ) -> Result<Vec<u8>, JsError> {
        self.mls_group
            .export_secret(provider.0.crypto(), label, context, key_length)
            .map_err(|e| JsError::new(&format!("export_secret failed: {e}")))
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn serialize_message(msg: &MlsMessageOut) -> Result<Vec<u8>, JsError> {
    let mut out = vec![];
    msg.tls_serialize(&mut out)
        .map_err(|e| JsError::new(&format!("MlsMessage serialize failed: {e}")))?;
    Ok(out)
}

// ─── Tests ───────────────────────────────────────────────────────────────────
//
// All tests run on the native target (`cargo test`). They exercise the
// public wrapper API end-to-end — the same code paths that JS will hit.
// `wasm-bindgen-test` for in-browser checks comes in 4b once the JS
// adapters land.

#[cfg(test)]
mod tests {
    use super::*;

    fn make_alice_and_bob() -> (Provider, Identity, Provider, Identity) {
        let alice_p = Provider::new();
        let alice = Identity::new(&alice_p, b"alice@idp.alice.com").unwrap();
        let bob_p = Provider::new();
        let bob = Identity::new(&bob_p, b"bob@idp.bob.com").unwrap();
        (alice_p, alice, bob_p, bob)
    }

    /// A commit the DS never acknowledged blocks the group's next commit; clearing it frees it.
    #[test]
    fn a_cleared_pending_commit_lets_the_group_commit_again() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let (mut alice_p, mut bob_p) = (alice_p, bob_p);
        let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-002").unwrap();
        let add = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let tree = alice_group.export_ratchet_tree().unwrap();
        let mut bob_group = Group::join(&bob_p, &add.welcome, Some(tree)).unwrap();

        alice_group.remove_member(&alice_p, 1).unwrap();
        assert!(alice_group.mls_group.pending_commit().is_some());

        alice_group.clear_pending_commit(&mut alice_p).unwrap();
        assert!(alice_group.mls_group.pending_commit().is_none());
        let update = alice_group.update(&alice_p).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group.process_message(&mut bob_p, &update.commit).unwrap();
        let ciphertext = alice_group
            .encrypt_application(&alice_p, b"still in step")
            .unwrap();
        let processed = bob_group.process_message(&mut bob_p, &ciphertext).unwrap();
        assert_eq!(processed.application(), b"still in step");
    }

    /// Bob, committed out of the group and added back, takes the Welcome over the group he held.
    #[test]
    fn a_welcome_from_a_later_epoch_replaces_the_group_held() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let (mut alice_p, mut bob_p) = (alice_p, bob_p);
        let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-003").unwrap();
        let first = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut held = Group::join(&bob_p, &first.welcome, None).unwrap();
        alice_group.remove_member(&alice_p, 1).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let again = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        let mut rejoined = held.rejoin(&bob_p, &again.welcome).unwrap().unwrap();

        assert_eq!(rejoined.epoch(), alice_group.epoch());
        let ciphertext = alice_group
            .encrypt_application(&alice_p, b"welcome back")
            .unwrap();
        let processed = rejoined.process_message(&mut bob_p, &ciphertext).unwrap();
        assert_eq!(processed.application(), b"welcome back");
        let stored = Group::load_from_provider(&bob_p, b"conv-003").unwrap().unwrap();
        assert_eq!(stored.epoch(), rejoined.epoch());
    }

    /// Both founded the group at once: Alice's Welcome is no later than Bob's own group, so Bob
    /// keeps his.
    #[test]
    fn a_welcome_no_later_than_the_group_held_keeps_it() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let (mut alice_p, mut bob_p) = (alice_p, bob_p);
        let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-004").unwrap();
        let add = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut bobs_own = Group::create_new(&bob_p, &bob, b"conv-004").unwrap();
        bobs_own.update(&bob_p).unwrap();
        bobs_own.merge_pending_commit(&mut bob_p).unwrap();

        assert!(bobs_own.rejoin(&bob_p, &add.welcome).unwrap().is_none());

        let stored = Group::load_from_provider(&bob_p, b"conv-004").unwrap().unwrap();
        assert_eq!(stored.list_members().len(), 1);
        assert_eq!(stored.epoch(), 1);
    }

    #[test]
    fn a_deleted_group_is_gone_from_the_provider() {
        let (alice_p, alice, _, _) = make_alice_and_bob();
        let mut group = Group::create_new(&alice_p, &alice, b"conv-005").unwrap();

        group.delete(&alice_p).unwrap();

        assert!(Group::load_from_provider(&alice_p, b"conv-005").unwrap().is_none());
    }

    /// Two-member group: create, add, exchange one app message, decrypt
    /// matches.
    #[test]
    fn two_member_round_trip() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p_mut = alice_p;
        let mut bob_p_mut = bob_p;

        let bob_kp = bob.key_package(&bob_p_mut).unwrap();
        let bob_kp_bytes = bob_kp.to_bytes().unwrap();
        // Round-trip the KeyPackage to prove the wire format works.
        let bob_kp_validated = KeyPackage::from_bytes(&bob_kp_bytes).unwrap();

        let mut alice_group =
            Group::create_new(&alice_p_mut, &alice, b"conv-001").unwrap();

        let add = alice_group
            .add_member(&alice_p_mut, &bob_kp_validated)
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

        let tree = alice_group.export_ratchet_tree().unwrap();
        let mut bob_group = Group::join(&bob_p_mut, &add.welcome, Some(tree)).unwrap();

        // Alice encrypts; Bob decrypts.
        let plaintext = b"hello bob, encrypted";
        let ciphertext = alice_group
            .encrypt_application(&alice_p_mut, plaintext)
            .unwrap();
        let processed = bob_group.process_message(&mut bob_p_mut, &ciphertext).unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Application));
        assert_eq!(processed.application(), plaintext);
    }

    /// Three-member group: alice adds bob, then alice adds charles. Bob
    /// processes alice's add-charles commit; all three can decrypt the
    /// same message.
    #[test]
    fn three_member_fanout() {
        let alice_p = Provider::new();
        let alice = Identity::new(&alice_p, b"alice").unwrap();
        let bob_p = Provider::new();
        let bob = Identity::new(&bob_p, b"bob").unwrap();
        let charles_p = Provider::new();
        let charles = Identity::new(&charles_p, b"charles").unwrap();

        let mut alice_p_mut = alice_p;
        let mut bob_p_mut = bob_p;
        let mut charles_p_mut = charles_p;

        let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();

        // Add Bob.
        let bob_kp = bob.key_package(&bob_p_mut).unwrap();
        let add_bob = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
        let mut bob_group = Group::join(
            &bob_p_mut,
            &add_bob.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        // Add Charles. Bob has to process the commit so his copy of the
        // group advances to the same epoch.
        let charles_kp = charles.key_package(&charles_p_mut).unwrap();
        let add_charles = alice_group
            .add_member(&alice_p_mut, &charles_kp)
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

        let processed = bob_group
            .process_message(&mut bob_p_mut, &add_charles.commit)
            .unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Commit));

        let mut charles_group = Group::join(
            &charles_p_mut,
            &add_charles.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        // All three can decrypt the same application message.
        let msg = b"hello group";
        let ct = alice_group
            .encrypt_application(&alice_p_mut, msg)
            .unwrap();
        for (group, prov) in [
            (&mut bob_group, &mut bob_p_mut),
            (&mut charles_group, &mut charles_p_mut),
        ] {
            let p = group.process_message(prov, &ct).unwrap();
            assert!(matches!(p.kind(), ProcessedKind::Application));
            assert_eq!(p.application(), msg);
        }
    }

    /// After `remove_member` is committed, Alice's epoch advances past
    /// Bob's. The negative-side proof (Bob can't decrypt) lives in the
    /// browser test harness — `JsError::new` panics on native targets,
    /// which makes `Err(_)` returns from this wrapper unreachable here.
    /// Phase 4b's `wasm-bindgen-test` run covers it.
    #[test]
    fn remove_member_advances_epoch() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p_mut = alice_p;
        let bob_p_mut = bob_p;

        let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
        let bob_kp = bob.key_package(&bob_p_mut).unwrap();
        let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
        let bob_group = Group::join(
            &bob_p_mut,
            &add.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        let bob_epoch_before = bob_group.epoch();
        assert_eq!(alice_group.epoch(), bob_epoch_before);

        // Bob's leaf is at index 1 (Alice is 0).
        let _remove = alice_group
            .remove_member(&alice_p_mut, 1)
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

        assert!(
            alice_group.epoch() > bob_epoch_before,
            "alice's epoch must advance after a remove commit"
        );
        // Bob's group state is left at the old epoch — his client never
        // applies a commit that excludes its own leaf, which is exactly
        // the "your device just got revoked" UI signal Phase 6 wires up.
    }

    /// After self-update(), the new epoch advances. Both sides keep
    /// decrypting in lockstep.
    #[test]
    fn self_update_advances_epoch() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p_mut = alice_p;
        let mut bob_p_mut = bob_p;

        let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
        let bob_kp = bob.key_package(&bob_p_mut).unwrap();
        let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
        let mut bob_group = Group::join(
            &bob_p_mut,
            &add.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        let epoch_before = alice_group.epoch();

        let upd = alice_group.update(&alice_p_mut).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

        // Bob processes the update commit.
        let processed = bob_group.process_message(&mut bob_p_mut, &upd.commit).unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Commit));

        let epoch_after = alice_group.epoch();
        assert!(
            epoch_after > epoch_before,
            "epoch should advance after self_update"
        );
        assert_eq!(
            alice_group.epoch(),
            bob_group.epoch(),
            "epochs should match"
        );

        // And messages still flow.
        let ct = alice_group
            .encrypt_application(&alice_p_mut, b"post-update")
            .unwrap();
        let processed = bob_group.process_message(&mut bob_p_mut, &ct).unwrap();
        assert_eq!(processed.application(), b"post-update");
    }

    /// `export_secret` returns the same bytes on both sides.
    #[test]
    fn exported_secrets_match() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p_mut = alice_p;
        let bob_p_mut = bob_p;

        let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
        let bob_kp = bob.key_package(&bob_p_mut).unwrap();
        let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
        let bob_group = Group::join(
            &bob_p_mut,
            &add.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        let label = "pinai/attachment-key/v1";
        let context = b"attachment-uuid-deadbeef";
        let len = 32;
        let alice_key = alice_group
            .export_secret(&alice_p_mut, label, context, len)
            .unwrap();
        let bob_key = bob_group.export_secret(&bob_p_mut, label, context, len).unwrap();
        assert_eq!(alice_key, bob_key);
        assert_eq!(alice_key.len(), len);
    }

    /// `Provider::serialize_storage` → `deserialize_storage` round
    /// trips through a fresh `Provider`; `Group::load_from_provider`
    /// then rebuilds the in-memory group handle and decrypts an
    /// inbound application message exactly the same way the original
    /// adapter would have. This is the path that survives a page
    /// reload.
    #[test]
    fn provider_storage_round_trip_restores_group() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p_mut = alice_p;
        let bob_p_immut = bob_p;

        let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv-restore").unwrap();
        let bob_kp = bob.key_package(&bob_p_immut).unwrap();
        let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
        alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

        let bob_group = Group::join(
            &bob_p_immut,
            &add.welcome,
            Some(alice_group.export_ratchet_tree().unwrap()),
        )
        .unwrap();

        // Snapshot Bob's provider, drop both Bob's group + provider,
        // then restore from the snapshot into a fresh provider and
        // re-load the group via its id.
        let snapshot = bob_p_immut.serialize_storage().unwrap();
        drop(bob_group);
        drop(bob_p_immut);

        let restored_p = Provider::new();
        restored_p.deserialize_storage(&snapshot).unwrap();
        let mut bob_loaded = Group::load_from_provider(&restored_p, b"conv-restore")
            .unwrap()
            .expect("Bob's group should be in the restored provider");

        // Alice sends one more message; restored Bob decrypts it.
        let ct = alice_group
            .encrypt_application(&alice_p_mut, b"after-reload")
            .unwrap();
        let mut restored_p_mut = restored_p;
        let processed = bob_loaded.process_message(&mut restored_p_mut, &ct).unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Application));
        assert_eq!(processed.application(), b"after-reload");
    }
}
