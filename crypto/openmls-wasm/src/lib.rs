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
//! - [`Identity`] — a leaf signature key bound to its `BasicCredential`. The key is made first
//!   ([`Identity::generate_signature_key`]), so the device's root key can sign it into the
//!   credential before [`Identity::bind`] puts the two together.
//! - [`KeyPackage`] — single-use bundle uploaded to the IdP key directory; a claimed one shows
//!   its leaf's credential and signature key, which the device checks before adding it.
//! - [`hpke`] — HPKE in base mode, the suite key shares are sealed with.
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
    framing::{MlsMessageBodyIn, MlsMessageIn, MlsMessageOut, ProcessedMessageContent, Sender},
    group::{CommitBuilder, GroupId, Initial, MlsGroup, MlsGroupJoinConfig, StagedCommit, StagedWelcome},
    key_packages::{KeyPackage as OpenMlsKeyPackage, KeyPackageIn, Lifetime},
    messages::{group_info::VerifiableGroupInfo, Welcome},
    prelude::{LeafNodeIndex, LeafNodeParameters, ProtocolVersion, SignatureScheme},
    treesync::RatchetTreeIn,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::{types::Ciphersuite, OpenMlsProvider};
use tls_codec::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

pub mod hpke;

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

fn group_info_in(group_info_bytes: &[u8]) -> Result<VerifiableGroupInfo, JsError> {
    let mut s = group_info_bytes;
    let msg = MlsMessageIn::tls_deserialize(&mut s)
        .map_err(|e| JsError::new(&format!("GroupInfo deserialize failed: {e}")))?;
    match msg.extract() {
        MlsMessageBodyIn::GroupInfo(g) => Ok(g),
        other => Err(JsError::new(&format!(
            "Expected GroupInfo message, got {other:?}"
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

/// A year: a member applies an add only within the added KeyPackage's lifetime, and openmls's
/// 12 weeks would leave one away a few weeks unable to read on (`README.md`).
const KEY_PACKAGE_LIFETIME_SECONDS: u64 = 365 * 24 * 60 * 60;

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

/// A leaf signature key + the MLS credential bound to it.
///
/// The actual `SignatureKeyPair` lives in the provider's storage —
/// holding it directly on this struct exhibited a release-build /
/// wasm-bindgen interaction where the keypair's `signature_scheme` and
/// `public/private` byte buffers got zeroed between its creation
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
    /// Look up the signature keypair that
    /// [`Identity::generate_signature_key`] stashed in the provider's storage. Returns
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
                     likely lost state across a snapshot round-trip",
                )
            })
    }

    fn key_package_living(&self, provider: &Provider, lifetime: Lifetime) -> Result<KeyPackage, JsError> {
        let signer = self.signer(provider)?;
        let kp = OpenMlsKeyPackage::builder()
            .key_package_lifetime(lifetime)
            .build(
                CIPHERSUITE,
                &provider.0,
                &signer,
                self.credential_with_key.clone(),
            )
            .map_err(|e| JsError::new(&format!("KeyPackage build failed: {e}")))?;
        Ok(KeyPackage(kp.key_package().clone()))
    }
}

#[wasm_bindgen]
impl Identity {
    /// A fresh leaf signature keypair, kept in the provider's storage: its public key, for the
    /// credential to bind before [`Identity::bind`].
    pub fn generate_signature_key(provider: &Provider) -> Result<Vec<u8>, JsError> {
        let keypair = SignatureKeyPair::new(SignatureScheme::ED25519)
            .map_err(|e| JsError::new(&format!("Identity keypair gen failed: {e}")))?;
        keypair
            .store(provider.0.storage())
            .map_err(|e| JsError::new(&format!("Identity keypair store failed: {e}")))?;
        Ok(keypair.public().to_vec())
    }

    /// Bind `credential` to a keypair already in `provider.storage()` — made by
    /// [`Identity::generate_signature_key`], or restored with a snapshot.
    ///
    /// Errors if no matching keypair is in provider storage.
    pub fn bind(
        provider: &Provider,
        credential: &[u8],
        signature_public_key: Vec<u8>,
    ) -> Result<Identity, JsError> {
        let scheme = SignatureScheme::ED25519;
        SignatureKeyPair::read(provider.0.storage(), &signature_public_key, scheme).ok_or_else(|| {
            JsError::new("Identity::bind: no keypair in provider storage for this signature key")
        })?;
        let credential_with_key = CredentialWithKey {
            credential: BasicCredential::new(credential.to_vec()).into(),
            signature_key: signature_public_key.clone().into(),
        };
        Ok(Identity {
            credential_with_key,
            signature_public_key,
            signature_scheme_repr: scheme as u16,
        })
    }

    /// Build a fresh single-use KeyPackage for upload to the IdP key
    /// directory, living [`KEY_PACKAGE_LIFETIME_SECONDS`]. Caller is
    /// responsible for batching these into the `POST /api/keys/packages` payload.
    pub fn key_package(&self, provider: &Provider) -> Result<KeyPackage, JsError> {
        self.key_package_living(provider, Lifetime::new(KEY_PACKAGE_LIFETIME_SECONDS))
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

    /// The identity bytes of its leaf's `BasicCredential`.
    pub fn credential_bytes(&self) -> Vec<u8> {
        self.0.leaf_node().credential().serialized_content().to_vec()
    }

    /// Its leaf's raw Ed25519 signature key, which the credential's leaf binding must sign.
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.leaf_node().signature_key().as_slice().to_vec()
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
/// - `commit` and `group_info` → `POST /api/mls/groups/:id/commits`
/// - `welcome` → cross-IdP `Create{Note}` with `mlsKind: welcome` (or local
///   `mls_welcomes` insert via the IdP REST surface).
#[wasm_bindgen]
pub struct AddOutput {
    commit: Vec<u8>,
    welcome: Vec<u8>,
    group_info: Vec<u8>,
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
    /// The GroupInfo of the epoch the commit opens, as an `MlsMessage`: what a device joins by on
    /// its own ([`Group::join_by_external_commit`]).
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.group_info.clone()
    }
}

/// Commit-only output for `remove_member`, `update` and `update_credential`.
#[wasm_bindgen]
pub struct CommitOutput {
    commit: Vec<u8>,
    group_info: Vec<u8>,
}

#[wasm_bindgen]
impl CommitOutput {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }
    /// As [`AddOutput::group_info`].
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.group_info.clone()
    }
}

/// A device's join by external commit, pending until the DS takes the commit: the group, the
/// commit adding this device, and the GroupInfo of the epoch it opens.
#[wasm_bindgen]
pub struct ExternalJoin {
    group: Group,
    commit: Vec<u8>,
    group_info: Vec<u8>,
}

#[wasm_bindgen]
impl ExternalJoin {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }
    /// As [`AddOutput::group_info`].
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.group_info.clone()
    }
    /// The epoch the commit opens, which it is posted at.
    #[wasm_bindgen(getter)]
    pub fn epoch(&self) -> u64 {
        self.group.epoch()
    }
    pub fn into_group(self) -> Group {
        self.group
    }
}

/// What a commit of this device's produces.
struct Committed {
    commit: Vec<u8>,
    welcome: Option<MlsMessageOut>,
    group_info: Vec<u8>,
}

/// One leaf in the MLS tree: its index, its credential's identity bytes, its signature key.
#[wasm_bindgen]
#[derive(Clone, PartialEq, Eq, Debug)]
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
    /// A proposal — a member's, or a join proposal from outside —, ignored: never stored.
    Proposal,
    /// A commit, checked and staged: [`Group::apply_commit`] merges it, and the group moves to
    /// the next epoch. Dropped unapplied, it leaves the group as it was.
    Commit,
}

#[wasm_bindgen]
pub struct ProcessedMessage {
    kind: ProcessedKind,
    application: Vec<u8>,
    leaves_met: Vec<GroupMember>,
    joiner: Option<GroupMember>,
    removed: Vec<GroupMember>,
    staged: Option<Box<StagedCommit>>,
}

impl ProcessedMessage {
    fn other(kind: ProcessedKind, application: Vec<u8>) -> Self {
        ProcessedMessage {
            kind,
            application,
            leaves_met: vec![],
            joiner: None,
            removed: vec![],
            staged: None,
        }
    }
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
    /// For a commit once applied: the leaves it brought in or replaced — added, a device committing
    /// itself in, or the committer's own changed by its path —, this device's own left out. Empty
    /// otherwise.
    #[wasm_bindgen(getter)]
    pub fn leaves_met(&self) -> Vec<GroupMember> {
        self.leaves_met.clone()
    }
    /// For an external commit — a device committing itself in, its sender a `new_member_commit`:
    /// the leaf it brings in, at the index it takes. `None` for any other message.
    #[wasm_bindgen(getter)]
    pub fn joiner(&self) -> Option<GroupMember> {
        self.joiner.clone()
    }
    /// For a commit: the leaves it removes, as they stand before it. RFC 9420 § 12.4.3.2 leaves an
    /// external commit's removals to the application to accept. Empty otherwise.
    #[wasm_bindgen(getter)]
    pub fn removed(&self) -> Vec<GroupMember> {
        self.removed.clone()
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

/// How many past epochs' keys a device keeps for the messages it hasn't read: a message and a
/// commit travel separately, and one sent just before a commit can arrive after it. openmls still
/// deletes each key once used.
const MAX_PAST_EPOCHS: usize = 5;

/// Rows the provider holds under `id` that no group held stands for — a join by external commit
/// never kept: deleted, or a join over them would find a group already there.
fn delete_stale(provider: &Provider, id: &GroupId) -> Result<(), JsError> {
    if let Some(mut stale) = MlsGroup::load(provider.0.storage(), id)
        .map_err(|e| JsError::new(&format!("Group::load failed: {e:?}")))?
    {
        stale
            .delete(provider.0.storage())
            .map_err(|e| JsError::new(&format!("Group delete failed: {e:?}")))?;
    }
    Ok(())
}

/// How a device runs a group it joined. Its Welcomes carry the ratchet tree, as a founder's do: a
/// user's other devices and later members are added by whoever is at hand, not only the founder.
/// It keeps the last `MAX_PAST_EPOCHS` epochs' keys for messages it hasn't read.
fn join_config() -> MlsGroupJoinConfig {
    MlsGroupJoinConfig::builder()
        .use_ratchet_tree_extension(true)
        .max_past_epochs(MAX_PAST_EPOCHS)
        .build()
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
            // As every member's Welcomes do (`join_config`): a joiner needs nothing else.
            .use_ratchet_tree_extension(true)
            .max_past_epochs(MAX_PAST_EPOCHS)
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
        let Some(mut mls_group) = MlsGroup::load(provider.0.storage(), &id)
            .map_err(|e| JsError::new(&format!("Group::load failed: {e:?}")))?
        else {
            return Ok(None);
        };
        // Joined while Welcomes went without the ratchet tree: the next one it sent would leave
        // its joiner unable to build the group.
        if mls_group.configuration() != &join_config() {
            mls_group
                .set_configuration(provider.0.storage(), &join_config())
                .map_err(|e| JsError::new(&format!("Group config update failed: {e:?}")))?;
        }
        Ok(Some(Group { mls_group }))
    }

    /// Build a group from a Welcome we received. The ratchet tree must
    /// match what the inviter committed — Phase 4b passes the bytes
    /// alongside the welcome. Rows the provider still holds under that group id — a join by
    /// external commit never kept — are deleted first. Like every join, it checks no leaf's
    /// lifetime (`README.md`).
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

        let mut join = StagedWelcome::build_from_welcome(&provider.0, &join_config(), welcome)
            .map_err(|e| JsError::new(&format!("StagedWelcome failed: {e}")))?
            .skip_lifetime_validation();
        if let Some(tree) = ratchet_tree {
            join = join.with_ratchet_tree(tree);
        }
        let group_id = join.processed_welcome().unverified_group_info().group_id().clone();
        delete_stale(provider, &group_id)?;
        let mls_group = join
            .build()
            .map_err(|e| JsError::new(&format!("StagedWelcome failed: {e}")))?
            .into_group(&provider.0)
            .map_err(|e| JsError::new(&format!("Group join failed: {e}")))?;

        Ok(Group { mls_group })
    }

    /// Join `group_id` from a GroupInfo of it, by an external commit adding this device's leaf:
    /// `identity`'s credential over its key, as its KeyPackages carry. openmls merges the commit as
    /// it makes it, so the group is the caller's to keep once the DS took the commit, or to
    /// [`Group::delete`] once refused. Rows the provider still holds under that id — a join never
    /// kept — are deleted first. Like every join, it checks no leaf's lifetime (`README.md`).
    pub fn join_by_external_commit(
        provider: &Provider,
        identity: &Identity,
        group_id: &[u8],
        group_info_bytes: &[u8],
    ) -> Result<ExternalJoin, JsError> {
        let group_info = group_info_in(group_info_bytes)?;
        let id = GroupId::from_slice(group_id);
        if group_info.group_id() != &id {
            return Err(JsError::new("The GroupInfo is another group's"));
        }
        delete_stale(provider, &id)?;
        let signer = identity.signer(provider)?;
        let (mls_group, bundle) = MlsGroup::external_commit_builder()
            .with_config(join_config())
            .skip_lifetime_validation()
            .build_group(&provider.0, group_info, identity.credential_with_key.clone())
            .map_err(|e| JsError::new(&format!("External commit failed: {e}")))?
            .load_psks(provider.0.storage())
            .map_err(|e| JsError::new(&format!("External commit failed: {e}")))?
            .use_ratchet_tree_extension(true)
            .build(provider.0.rand(), provider.0.crypto(), &signer, |_| true)
            .map_err(|e| JsError::new(&format!("External commit failed: {e}")))?
            .finalize(&provider.0)
            .map_err(|e| JsError::new(&format!("External commit failed: {e}")))?;
        let (commit, _, group_info) = bundle.into_messages();
        Ok(ExternalJoin {
            group: Group { mls_group },
            commit: serialize_message(&commit)?,
            group_info: serialize_message(
                &group_info.ok_or_else(|| JsError::new("The external commit made no GroupInfo"))?,
            )?,
        })
    }

    /// Join again from a Welcome for this group — the device was committed out and added back.
    /// The group held is replaced only when the Welcome brings a later epoch; `None` keeps it, as
    /// for a Welcome from a group both sides founded at once. Like every join, it checks no leaf's
    /// lifetime (`README.md`).
    pub fn rejoin(
        &mut self,
        provider: &Provider,
        welcome_bytes: &[u8],
    ) -> Result<Option<Group>, JsError> {
        let welcome = welcome_in(welcome_bytes)?;
        let staged = StagedWelcome::build_from_welcome(&provider.0, &join_config(), welcome)
            .and_then(|join| join.replace_old_group().skip_lifetime_validation().build())
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

    /// Every leaf of the group, its index the one [`Group::remove_member`] takes.
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

    /// This device's own leaf.
    pub fn own_leaf_index(&self) -> u32 {
        self.mls_group.own_leaf_index().u32()
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
        let committed = self.commit(provider, |builder| {
            builder
                .propose_adds([new_member_kp.0.clone()])
                .force_self_update(true)
        })?;
        Ok(AddOutput {
            commit: committed.commit,
            welcome: serialize_message(
                &committed
                    .welcome
                    .ok_or_else(|| JsError::new("The add made no Welcome"))?,
            )?,
            group_info: committed.group_info,
        })
    }

    /// Remove the leaf at `member_index`. JS gets the index from
    /// `Group::list_members` (added in 4b) keyed by leaf credential.
    pub fn remove_member(
        &mut self,
        provider: &Provider,
        member_index: u32,
    ) -> Result<CommitOutput, JsError> {
        let committed = self.commit(provider, |builder| {
            builder.propose_removals([LeafNodeIndex::new(member_index)])
        })?;
        Ok(CommitOutput {
            commit: committed.commit,
            group_info: committed.group_info,
        })
    }

    /// Self-update — rotates the caller's leaf key for post-compromise
    /// security. Generates one Commit; no Welcome.
    pub fn update(
        &mut self,
        provider: &Provider,
    ) -> Result<CommitOutput, JsError> {
        let committed = self.commit(provider, |builder| {
            builder.leaf_node_parameters(LeafNodeParameters::default())
        })?;
        Ok(CommitOutput {
            commit: committed.commit,
            group_info: committed.group_info,
        })
    }

    /// Commits this device's own leaf again with `credential`, over the signature key it carries:
    /// a leaf credential made before its leaf binding, or before an attestation renewed. One
    /// Commit, merged like the others once the DS took it.
    pub fn update_credential(
        &mut self,
        provider: &Provider,
        credential: &[u8],
    ) -> Result<CommitOutput, JsError> {
        let signer = self.signer(provider)?;
        let parameters = LeafNodeParameters::builder()
            .with_credential_with_key(CredentialWithKey {
                credential: BasicCredential::new(credential.to_vec()).into(),
                signature_key: signer.public().into(),
            })
            .build();
        let committed = self.commit(provider, |builder| builder.leaf_node_parameters(parameters))?;
        Ok(CommitOutput {
            commit: committed.commit,
            group_info: committed.group_info,
        })
    }

    /// A commit of this device's own proposals, staged until the DS takes it, with the GroupInfo
    /// of the epoch it opens, ratchet tree and `external_pub` in it. The proposal store is never
    /// committed: whatever it holds, someone else proposed.
    fn commit(
        &mut self,
        provider: &Provider,
        build: impl for<'a> FnOnce(CommitBuilder<'a, Initial>) -> CommitBuilder<'a, Initial>,
    ) -> Result<Committed, JsError> {
        if !self.mls_group.is_active() {
            return Err(JsError::new("This device is no longer in the group"));
        }
        if self.mls_group.pending_commit().is_some() {
            return Err(JsError::new("A commit of this group is still pending"));
        }
        let signer = self.signer(provider)?;
        let bundle = build(self.mls_group.commit_builder().consume_proposal_store(false))
            .load_psks(provider.0.storage())
            .map_err(|e| JsError::new(&format!("Commit failed: {e}")))?
            .use_ratchet_tree_extension(true)
            .build(provider.0.rand(), provider.0.crypto(), &signer, |_| true)
            .map_err(|e| JsError::new(&format!("Commit failed: {e}")))?
            .stage_commit(&provider.0)
            .map_err(|e| JsError::new(&format!("Commit failed: {e}")))?;
        let welcome = bundle.to_welcome_msg();
        let (commit, _, group_info) = bundle.into_messages();
        Ok(Committed {
            commit: serialize_message(&commit)?,
            welcome,
            group_info: serialize_message(
                &group_info.ok_or_else(|| JsError::new("The commit made no GroupInfo"))?,
            )?,
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

    /// Process any inbound MLS message — application, proposal, or commit. Application messages
    /// return their plaintext; proposals are ignored. A commit is checked and staged, not merged:
    /// it shows its joiner and the leaves it removes, and [`Group::apply_commit`] merges it.
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
        let external = matches!(processed.sender(), Sender::NewMemberCommit);

        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(app) => {
                Ok(ProcessedMessage::other(ProcessedKind::Application, app.into_bytes()))
            }
            // Never stored: a stored proposal rides a member's next commit, so anyone holding only
            // a user's password could ask in and be committed by a member. Our clients send none.
            ProcessedMessageContent::ProposalMessage(_)
            | ProcessedMessageContent::ExternalJoinProposalMessage(_) => {
                Ok(ProcessedMessage::other(ProcessedKind::Proposal, vec![]))
            }
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                let before = self.list_members();
                let gone: Vec<u32> = staged
                    .remove_proposals()
                    .map(|r| r.remove_proposal().removed().u32())
                    .collect();
                let removed = before
                    .iter()
                    .filter(|m| gone.contains(&m.leaf_index))
                    .cloned()
                    .collect();
                // The leftmost leaf no member holds once the removals are applied (RFC 9420 § 7.8).
                let free = (0..).find(|i| {
                    !before.iter().any(|m| m.leaf_index == *i && !gone.contains(i))
                });
                let joiner = match (external, staged.update_path_leaf_node(), free) {
                    (true, Some(leaf), Some(leaf_index)) => Some(GroupMember {
                        leaf_index,
                        credential_bytes: leaf.credential().serialized_content().to_vec(),
                        signature_public_key: leaf.signature_key().as_slice().to_vec(),
                    }),
                    _ => None,
                };
                Ok(ProcessedMessage {
                    kind: ProcessedKind::Commit,
                    application: vec![],
                    leaves_met: vec![],
                    joiner,
                    removed,
                    staged: Some(staged),
                })
            }
        }
    }

    /// Merges the commit `processed` staged: the group moves to its epoch, and `processed` tells
    /// the leaves the commit met and where its joiner sits.
    pub fn apply_commit(
        &mut self,
        provider: &mut Provider,
        processed: &mut ProcessedMessage,
    ) -> Result<(), JsError> {
        let staged = processed.staged.take().ok_or_else(|| JsError::new("No commit to apply"))?;
        let before = self.list_members();
        self.mls_group
            .merge_staged_commit(&provider.0, *staged)
            .map_err(|e| JsError::new(&format!("merge_staged_commit failed: {e}")))?;
        let own = self.own_leaf_index();
        let after = self.list_members();
        if let Some(joiner) = processed.joiner.as_mut() {
            let key = &joiner.signature_public_key;
            if let Some(leaf) = after.iter().find(|m| &m.signature_public_key == key) {
                joiner.leaf_index = leaf.leaf_index;
            }
        }
        processed.leaves_met = after
            .into_iter()
            .filter(|leaf| leaf.leaf_index != own && !before.contains(leaf))
            .collect();
        Ok(())
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
    use openmls::key_packages::errors::KeyPackageVerifyError;
    use openmls::messages::external_proposals::JoinProposal;

    impl Group {
        /// A message taken as the client takes it: a commit applied as it comes.
        fn receive(&mut self, provider: &mut Provider, msg_bytes: &[u8]) -> Result<ProcessedMessage, JsError> {
            let mut processed = self.process_message(provider, msg_bytes)?;
            if processed.staged.is_some() {
                self.apply_commit(provider, &mut processed)?;
            }
            Ok(processed)
        }
    }

    /// A fresh signature key bound to `credential`, as a device binds its leaf credential.
    fn identity(provider: &Provider, credential: &[u8]) -> Identity {
        let key = Identity::generate_signature_key(provider).unwrap();
        Identity::bind(provider, credential, key).unwrap()
    }

    fn make_alice_and_bob() -> (Provider, Identity, Provider, Identity) {
        let alice_p = Provider::new();
        let alice = identity(&alice_p, b"alice@idp.alice.com");
        let bob_p = Provider::new();
        let bob = identity(&bob_p, b"bob@idp.bob.com");
        (alice_p, alice, bob_p, bob)
    }

    /// A claimed KeyPackage shows what the device checks before adding it.
    #[test]
    fn a_key_package_shows_its_leafs_credential_and_signature_key() {
        let provider = Provider::new();
        let key = Identity::generate_signature_key(&provider).unwrap();
        let bound = Identity::bind(&provider, b"{\"v\":2}", key.clone()).unwrap();

        let parsed = KeyPackage::from_bytes(&bound.key_package(&provider).unwrap().to_bytes().unwrap()).unwrap();

        assert_eq!(parsed.credential_bytes(), b"{\"v\":2}");
        assert_eq!(parsed.signature_public_key(), key);
        assert_eq!(key.len(), 32);
    }

    /// Bob meets the leaf Alice's commit brings in; neither his own nor Alice's, unchanged, is news.
    #[test]
    fn a_commit_adding_a_leaf_reports_it_as_met() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-011");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles@idp.bob.com");
        let add = alice_group
            .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        let processed = bob_group.receive(&mut bob_p, &add.commit).unwrap();

        let met = processed.leaves_met();
        assert_eq!(met.len(), 1);
        assert_eq!(met[0].credential_bytes(), b"charles@idp.bob.com");
        assert_eq!(met[0].signature_public_key(), charles.signature_public_key());
        assert_eq!(bob_group.own_leaf_index(), 1);
        assert_eq!(alice_group.own_leaf_index(), 0);
    }

    #[test]
    fn a_commit_removing_a_leaf_meets_none() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-012");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles@idp.bob.com");
        let add = alice_group
            .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group.receive(&mut bob_p, &add.commit).unwrap();
        let remove = alice_group.remove_member(&alice_p, 2).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        let processed = bob_group.receive(&mut bob_p, &remove.commit).unwrap();

        assert!(processed.leaves_met().is_empty());
        assert_eq!(bob_group.list_members().len(), 2);
    }

    /// A device puts a new credential in its own leaf over the same key; its peers meet it and go
    /// on reading what it signs with that key.
    #[test]
    fn a_leaf_takes_a_new_credential_over_its_signature_key() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-013");
        let key = alice_group.list_members()[0].signature_public_key();

        let update = alice_group.update_credential(&alice_p, b"alice, bound").unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let processed = bob_group.receive(&mut bob_p, &update.commit).unwrap();

        let met = processed.leaves_met();
        assert_eq!(met.len(), 1);
        assert_eq!(met[0].leaf_index(), 0);
        assert_eq!(met[0].credential_bytes(), b"alice, bound");
        assert_eq!(met[0].signature_public_key(), key);
        assert_eq!(alice_group.list_members()[0].credential_bytes(), b"alice, bound");
        let ciphertext = alice_group.encrypt_application(&alice_p, b"still me").unwrap();
        let read = bob_group.receive(&mut bob_p, &ciphertext).unwrap();
        assert_eq!(read.application(), b"still me");
    }

    /// One of the four commits a device makes, answering one of its outputs.
    type MakeCommit<'a> = &'a dyn Fn(&mut Group, &Provider) -> Vec<u8>;

    /// Bob's proposal of a new credential for his leaf, as a member's client could send it.
    fn bobs_update_proposal(bob_p: &Provider, bob_group: &mut Group) -> Vec<u8> {
        let bob_signer = bob_group.signer(bob_p).unwrap();
        let parameters = LeafNodeParameters::builder()
            .with_credential_with_key(CredentialWithKey {
                credential: BasicCredential::new(b"bob, proposed".to_vec()).into(),
                signature_key: bob_signer.public().into(),
            })
            .build();
        let (proposal, _) = bob_group
            .mls_group
            .propose_self_update(&bob_p.0, &bob_signer, parameters)
            .unwrap();
        serialize_message(&proposal).unwrap()
    }

    /// Mallory, in no group, asking to be added to `group`.
    fn join_proposal(group: &Group, credential: &[u8]) -> Vec<u8> {
        let provider = Provider::new();
        let mallory = identity(&provider, credential);
        let proposal = JoinProposal::new::<<OpenMlsRustCrypto as OpenMlsProvider>::StorageProvider>(
            mallory.key_package(&provider).unwrap().0,
            group.mls_group.group_id().clone(),
            group.mls_group.epoch(),
            &mallory.signer(&provider).unwrap(),
        )
        .unwrap();
        serialize_message(&proposal).unwrap()
    }

    /// What the wrapper did with a proposal before: kept it, for the group's next commit to carry.
    fn store_as_before(group: &mut Group, provider: &Provider, proposal: &[u8]) {
        let processed = match MlsMessageIn::tls_deserialize(&mut &proposal[..]).unwrap().extract() {
            MlsMessageBodyIn::PrivateMessage(m) => group.mls_group.process_message(&provider.0, m),
            MlsMessageBodyIn::PublicMessage(m) => group.mls_group.process_message(&provider.0, m),
            other => panic!("not a proposal: {other:?}"),
        }
        .unwrap();
        match processed.into_content() {
            ProcessedMessageContent::ProposalMessage(p)
            | ProcessedMessageContent::ExternalJoinProposalMessage(p) => group
                .mls_group
                .store_pending_proposal(provider.0.storage(), *p)
                .unwrap(),
            _ => panic!("not a proposal"),
        }
    }

    /// A member's proposal and a join proposal from outside are taken and dropped.
    #[test]
    fn a_proposal_received_is_never_kept() {
        let (mut alice_p, mut alice_group, bob_p, mut bob_group) = alice_with_bob(b"conv-014");

        for proposal in [
            bobs_update_proposal(&bob_p, &mut bob_group),
            join_proposal(&alice_group, b"mallory"),
        ] {
            let processed = alice_group.receive(&mut alice_p, &proposal).unwrap();

            assert!(matches!(processed.kind(), ProcessedKind::Proposal));
            assert!(!alice_group.mls_group.has_pending_proposals());
        }
    }

    /// Whatever the group holds — proposals kept before they were ignored —, a commit carries only
    /// what this device proposed: no leaf Bob or Mallory proposed comes in by Alice's add, removal,
    /// update or new credential.
    #[test]
    fn a_commit_carries_no_proposal_it_did_not_make() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-017");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles").key_package(&charles_p).unwrap();
        let commits: [MakeCommit; 4] = [
            &|group, provider| group.add_member(provider, &charles).unwrap().commit,
            &|group, provider| group.remove_member(provider, 2).unwrap().commit,
            &|group, provider| group.update(provider).unwrap().commit,
            &|group, provider| group.update_credential(provider, b"alice, again").unwrap().commit,
        ];

        for commit in commits {
            let mallory = join_proposal(&alice_group, b"mallory");
            store_as_before(&mut alice_group, &alice_p, &mallory);
            store_as_before(&mut bob_group, &bob_p, &mallory);
            let update = bobs_update_proposal(&bob_p, &mut bob_group);
            store_as_before(&mut alice_group, &alice_p, &update);
            assert!(alice_group.mls_group.has_pending_proposals());

            let commit = commit(&mut alice_group, &alice_p);
            alice_group.merge_pending_commit(&mut alice_p).unwrap();
            bob_group.receive(&mut bob_p, &commit).unwrap();

            for group in [&alice_group, &bob_group] {
                let credentials: Vec<_> = group.list_members().iter().map(|m| m.credential_bytes()).collect();
                assert!(!credentials.contains(&b"mallory".to_vec()));
                assert!(credentials.contains(&b"bob@idp.bob.com".to_vec()));
                assert!(!credentials.contains(&b"bob, proposed".to_vec()));
            }
            assert!(!alice_group.mls_group.has_pending_proposals());
        }
    }

    /// The epoch a GroupInfo is of, once it is shown to carry what a device joins by alone: the
    /// ratchet tree and the `external_pub` key.
    fn joinable_epoch(group_info: &[u8], group_id: &[u8]) -> u64 {
        let info = group_info_in(group_info).unwrap();
        assert_eq!(info.group_id().as_slice(), group_id);
        assert!(info.extensions().ratchet_tree().is_some());
        assert!(info.extensions().external_pub().is_some());
        info.epoch().as_u64()
    }

    #[test]
    fn every_commit_comes_with_the_group_info_of_the_epoch_it_opens() {
        let (mut alice_p, mut alice_group, _, _) = alice_with_bob(b"conv-018");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles").key_package(&charles_p).unwrap();
        let commits: [MakeCommit; 4] = [
            &|group, provider| group.add_member(provider, &charles).unwrap().group_info,
            &|group, provider| group.remove_member(provider, 2).unwrap().group_info,
            &|group, provider| group.update(provider).unwrap().group_info,
            &|group, provider| group.update_credential(provider, b"alice, again").unwrap().group_info,
        ];

        for commit in commits {
            let group_info = commit(&mut alice_group, &alice_p);
            alice_group.merge_pending_commit(&mut alice_p).unwrap();

            assert_eq!(joinable_epoch(&group_info, b"conv-018"), alice_group.epoch());
        }
    }

    /// Alice's new laptop, holding no group, joins from the GroupInfo Bob's last commit came with;
    /// Bob meets its leaf as he applies the commit, as he meets an added one, and they read each
    /// other. Charles joins in turn from the GroupInfo the laptop's commit came with.
    #[test]
    fn a_device_joins_by_external_commit_from_a_commits_group_info() {
        let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-016");
        let update = bob_group.update(&bob_p).unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();
        let mut laptop_p = Provider::new();
        let laptop = identity(&laptop_p, b"alice's laptop");

        let join = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-016", &update.group_info).unwrap();
        let (commit, group_info) = (join.commit(), join.group_info());
        assert_eq!(join.epoch(), bob_group.epoch() + 1);
        let mut laptop_group = join.into_group();
        let processed = bob_group.receive(&mut bob_p, &commit).unwrap();

        assert!(matches!(processed.kind(), ProcessedKind::Commit));
        let met = processed.leaves_met();
        assert_eq!(met.len(), 1);
        assert_eq!(met[0].credential_bytes(), b"alice's laptop");
        assert_eq!(met[0].signature_public_key(), laptop.signature_public_key());
        assert_eq!(met[0].leaf_index(), laptop_group.own_leaf_index());
        assert_eq!(bob_group.epoch(), laptop_group.epoch());
        let to_bob = laptop_group.encrypt_application(&laptop_p, b"back").unwrap();
        assert_eq!(bob_group.receive(&mut bob_p, &to_bob).unwrap().application(), b"back");
        let to_laptop = bob_group.encrypt_application(&bob_p, b"welcome back").unwrap();
        assert_eq!(
            laptop_group.receive(&mut laptop_p, &to_laptop).unwrap().application(),
            b"welcome back"
        );
        assert_eq!(joinable_epoch(&group_info, b"conv-016"), laptop_group.epoch());

        let mut charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");
        let join = Group::join_by_external_commit(&charles_p, &charles, b"conv-016", &group_info).unwrap();
        let commit = join.commit();
        let mut charles_group = join.into_group();
        bob_group.receive(&mut bob_p, &commit).unwrap();
        laptop_group.receive(&mut laptop_p, &commit).unwrap();
        let hello = bob_group.encrypt_application(&bob_p, b"hello both").unwrap();
        for (group, provider) in [(&mut laptop_group, &mut laptop_p), (&mut charles_group, &mut charles_p)] {
            assert_eq!(group.receive(provider, &hello).unwrap().application(), b"hello both");
        }
    }

    /// Bob sees, before applying it, that the laptop's commit is a device committing itself in, which
    /// leaf it brings and where; applied, it sits there.
    #[test]
    fn an_external_commit_shows_its_joiner_where_it_sits() {
        let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-030");
        let update = bob_group.update(&bob_p).unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();
        let laptop_p = Provider::new();
        let laptop = identity(&laptop_p, b"alice's laptop");
        let join = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-030", &update.group_info).unwrap();
        let commit = join.commit();
        let laptop_group = join.into_group();
        let epoch = bob_group.epoch();

        let mut processed = bob_group.process_message(&mut bob_p, &commit).unwrap();

        let joiner = processed.joiner().unwrap();
        assert_eq!(joiner.credential_bytes(), b"alice's laptop");
        assert_eq!(joiner.signature_public_key(), laptop.signature_public_key());
        assert_eq!(joiner.leaf_index(), laptop_group.own_leaf_index());
        assert!(processed.removed().is_empty());
        assert_eq!(bob_group.epoch(), epoch);

        bob_group.apply_commit(&mut bob_p, &mut processed).unwrap();
        assert_eq!(bob_group.epoch(), epoch + 1);
        assert_eq!(processed.joiner().unwrap().leaf_index(), laptop_group.own_leaf_index());
        assert_eq!(processed.leaves_met(), vec![joiner]);
    }

    #[test]
    fn a_members_commit_has_no_joiner() {
        let (alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-031");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");
        let add = alice_group.add_member(&alice_p, &charles.key_package(&charles_p).unwrap()).unwrap();

        let processed = bob_group.process_message(&mut bob_p, &add.commit).unwrap();

        assert!(processed.joiner().is_none());
        assert!(processed.removed().is_empty());
    }

    /// Mallory commits herself in over the key of Charles's leaf, which openmls then removes: Bob
    /// sees the leaf it would remove, as it stands, and dropping the commit unapplied changes nothing.
    #[test]
    fn an_external_commit_shows_the_leaves_it_removes_and_dropped_changes_nothing() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-032");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");
        let add = alice_group.add_member(&alice_p, &charles.key_package(&charles_p).unwrap()).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group.receive(&mut bob_p, &add.commit).unwrap();
        let charles_leaf = bob_group.list_members().into_iter().find(|m| m.credential_bytes() == b"charles").unwrap();
        let mallory = Identity::bind(&charles_p, b"mallory", charles.signature_public_key()).unwrap();
        let join = Group::join_by_external_commit(&charles_p, &mallory, b"conv-032", &add.group_info).unwrap();
        let (members, epoch) = (bob_group.list_members(), bob_group.epoch());

        let processed = bob_group.process_message(&mut bob_p, &join.commit()).unwrap();

        assert_eq!(processed.removed(), vec![charles_leaf.clone()]);
        let joiner = processed.joiner().unwrap();
        assert_eq!(joiner.credential_bytes(), b"mallory");
        assert_eq!(joiner.leaf_index(), charles_leaf.leaf_index());
        drop(processed);
        assert_eq!((bob_group.list_members(), bob_group.epoch()), (members, epoch));
        let hello = alice_group.encrypt_application(&alice_p, b"still here").unwrap();
        assert_eq!(bob_group.receive(&mut bob_p, &hello).unwrap().application(), b"still here");
    }

    /// A join's group is stored as it is made; one the DS refused is deleted, and a join after
    /// it finds nothing in its way.
    #[test]
    fn a_refused_join_leaves_nothing_behind() {
        let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-019");
        let update = bob_group.update(&bob_p).unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();
        let laptop_p = Provider::new();
        let laptop = identity(&laptop_p, b"alice's laptop");

        let mut refused = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", &update.group_info)
            .unwrap()
            .into_group();
        assert!(Group::load_from_provider(&laptop_p, b"conv-019").unwrap().is_some());
        refused.delete(&laptop_p).unwrap();
        assert!(Group::load_from_provider(&laptop_p, b"conv-019").unwrap().is_none());

        Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", &update.group_info).unwrap();
        let again = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", &update.group_info).unwrap();
        let commit = again.commit();
        bob_group.receive(&mut bob_p, &commit).unwrap();
        assert_eq!(bob_group.list_members().len(), 3);
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
        bob_group.receive(&mut bob_p, &update.commit).unwrap();
        let ciphertext = alice_group
            .encrypt_application(&alice_p, b"still in step")
            .unwrap();
        let processed = bob_group.receive(&mut bob_p, &ciphertext).unwrap();
        assert_eq!(processed.application(), b"still in step");
    }

    /// A KeyPackage of `identity`'s whose leaf lives `seconds` more.
    fn short_lived_key_package(provider: &Provider, identity: &Identity, seconds: u64) -> KeyPackage {
        identity.key_package_living(provider, Lifetime::new(seconds)).unwrap()
    }

    /// Alice's group with Bob, whose leaf — never updated — outlived the KeyPackage it came in by.
    fn bob_past_his_leafs_lifetime(group_id: &[u8]) -> (Provider, Group, Provider, Group) {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p = alice_p;
        let mut alice_group = Group::create_new(&alice_p, &alice, group_id).unwrap();
        let add = alice_group
            .add_member(&alice_p, &short_lived_key_package(&bob_p, &bob, 1))
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let bob_group = Group::join(&bob_p, &add.welcome, None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2_100));
        (alice_p, alice_group, bob_p, bob_group)
    }

    /// Charles comes in by Welcome, Dave by external commit, and Charles again by Welcome once
    /// removed — all over Bob's leaf, past its lifetime, which openmls's default refuses.
    #[test]
    fn a_leaf_past_its_lifetime_keeps_no_device_out() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = bob_past_his_leafs_lifetime(b"conv-030");
        let mut charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");

        let add = alice_group
            .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group.receive(&mut bob_p, &add.commit).unwrap();
        let mut charles_group = Group::join(&charles_p, &add.welcome, None).unwrap();

        let refused = MlsGroup::external_commit_builder()
            .with_config(join_config())
            .build_group(&charles_p.0, group_info_in(&add.group_info).unwrap(), charles.credential_with_key.clone());
        assert!(refused.is_err(), "openmls's default checks the leaves' lifetimes");
        let mut dave_p = Provider::new();
        let dave = identity(&dave_p, b"dave");
        let join = Group::join_by_external_commit(&dave_p, &dave, b"conv-030", &add.group_info).unwrap();
        let commit = join.commit();
        let mut dave_group = join.into_group();
        for (group, provider) in [
            (&mut alice_group, &mut alice_p),
            (&mut bob_group, &mut bob_p),
            (&mut charles_group, &mut charles_p),
        ] {
            group.receive(provider, &commit).unwrap();
        }
        let hello = bob_group.encrypt_application(&bob_p, b"still here").unwrap();
        for (group, provider) in [(&mut charles_group, &mut charles_p), (&mut dave_group, &mut dave_p)] {
            assert_eq!(group.receive(provider, &hello).unwrap().application(), b"still here");
        }

        let remove = alice_group.remove_member(&alice_p, charles_group.own_leaf_index()).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        charles_group.receive(&mut charles_p, &remove.commit).unwrap();
        let back = alice_group
            .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut charles_group = charles_group.rejoin(&charles_p, &back.welcome).unwrap().unwrap();
        let again = alice_group.encrypt_application(&alice_p, b"welcome back").unwrap();
        assert_eq!(charles_group.receive(&mut charles_p, &again).unwrap().application(), b"welcome back");
    }

    /// The lifetime still counts when a KeyPackage is added: `KeyPackage::from_bytes` validates it so.
    #[test]
    fn a_key_package_past_its_lifetime_is_still_refused() {
        let provider = Provider::new();
        let bob = identity(&provider, b"bob");
        let bytes = short_lived_key_package(&provider, &bob, 1).to_bytes().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2_100));

        let validated = KeyPackageIn::tls_deserialize(&mut bytes.as_slice())
            .unwrap()
            .validate(&openmls_rust_crypto::RustCrypto::default(), ProtocolVersion::Mls10);

        assert!(matches!(validated, Err(KeyPackageVerifyError::InvalidLifetime)));
    }

    const WEEK: u64 = 7 * 24 * 60 * 60;

    /// A KeyPackage of `identity`'s made `ago` seconds back and living `seconds` from then — the
    /// clock moved on by `ago` since it was made, as far as its lifetime tells.
    fn key_package_made_ago(provider: &Provider, identity: &Identity, ago: u64, seconds: u64) -> KeyPackage {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let made = now - ago;
        identity
            .key_package_living(provider, Lifetime::init(made - 60 * 60, made + seconds))
            .unwrap()
    }

    /// Charles's KeyPackage was made 13 weeks ago: Bob, away since, still applies the add that used
    /// it, and reads Charles. Under openmls's default of 12 weeks, the check an add goes through —
    /// Bob's as he applies it, Alice's as she makes it — refuses it by then.
    #[test]
    fn a_member_applies_an_add_thirteen_weeks_after_the_key_package_was_made() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-032");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");
        let made = key_package_made_ago(&charles_p, &charles, 13 * WEEK, KEY_PACKAGE_LIFETIME_SECONDS);
        let add = alice_group.add_member(&alice_p, &made).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        bob_group.receive(&mut bob_p, &add.commit).unwrap();
        let mut charles_group = Group::join(&charles_p, &add.welcome, None).unwrap();
        let hello = charles_group.encrypt_application(&charles_p, b"hello Bob").unwrap();
        assert_eq!(bob_group.receive(&mut bob_p, &hello).unwrap().application(), b"hello Bob");

        let twelve_weeks = key_package_made_ago(&charles_p, &charles, 13 * WEEK, 12 * WEEK);
        let signer = alice_group.signer(&alice_p).unwrap();
        let refused = alice_group
            .mls_group
            .commit_builder()
            .propose_adds([twelve_weeks.0])
            .load_psks(alice_p.0.storage())
            .unwrap()
            .build(alice_p.0.rand(), alice_p.0.crypto(), &signer, |_| true);
        assert!(refused.is_err(), "openmls checks an added KeyPackage's lifetime");
    }

    /// What every KeyPackage carries: a year, from an hour back for clocks running late.
    #[test]
    fn a_key_package_lives_a_year() {
        let provider = Provider::new();
        let bob = identity(&provider, b"bob");

        let lifetime = *bob.key_package(&provider).unwrap().0.life_time();

        assert_eq!(lifetime.not_after() - lifetime.not_before(), KEY_PACKAGE_LIFETIME_SECONDS + 60 * 60);
    }

    /// A join by external commit the provider still holds, neither kept nor deleted — a reload came
    /// while it was pending — doesn't stand in the way of a Welcome.
    #[test]
    fn a_welcome_joins_over_a_join_never_kept() {
        let (mut alice_p, mut alice_group, _, _) = alice_with_bob(b"conv-031");
        let update = alice_group.update(&alice_p).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut laptop_p = Provider::new();
        let laptop = identity(&laptop_p, b"alice's laptop");
        drop(Group::join_by_external_commit(&laptop_p, &laptop, b"conv-031", &update.group_info).unwrap());
        assert!(Group::load_from_provider(&laptop_p, b"conv-031").unwrap().is_some());

        let add = alice_group
            .add_member(&alice_p, &laptop.key_package(&laptop_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut laptop_group = Group::join(&laptop_p, &add.welcome, None).unwrap();

        let hello = alice_group.encrypt_application(&alice_p, b"in").unwrap();
        assert_eq!(laptop_group.receive(&mut laptop_p, &hello).unwrap().application(), b"in");
    }

    /// Bob joined Alice's group; Charles, whom Bob adds, joins from Bob's Welcome alone, as a
    /// user's second device does when its first adds it.
    #[test]
    fn a_welcome_from_a_member_who_joined_carries_the_ratchet_tree() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let (mut alice_p, mut bob_p) = (alice_p, bob_p);
        let mut charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles@idp.bob.com");
        let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-006").unwrap();
        let add_bob = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let mut bob_group = Group::join(&bob_p, &add_bob.welcome, None).unwrap();

        let add_charles = bob_group
            .add_member(&bob_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();
        let mut charles_group = Group::join(&charles_p, &add_charles.welcome, None).unwrap();

        let ciphertext = bob_group.encrypt_application(&bob_p, b"in").unwrap();
        let processed = charles_group
            .receive(&mut charles_p, &ciphertext)
            .unwrap();
        assert_eq!(processed.application(), b"in");
    }

    /// A group joined while Welcomes went without the tree takes it on load, so the next one it
    /// sends carries it.
    #[test]
    fn a_group_joined_without_the_ratchet_tree_extension_takes_it_on_load() {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let (mut alice_p, mut bob_p) = (alice_p, bob_p);
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles@idp.bob.com");
        let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-007").unwrap();
        let add_bob = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let before = MlsGroupJoinConfig::builder().build();
        StagedWelcome::new_from_welcome(&bob_p.0, &before, welcome_in(&add_bob.welcome).unwrap(), None)
            .unwrap()
            .into_group(&bob_p.0)
            .unwrap();

        let mut bob_group = Group::load_from_provider(&bob_p, b"conv-007").unwrap().unwrap();

        assert_eq!(bob_group.mls_group.configuration(), &join_config());
        let add_charles = bob_group
            .add_member(&bob_p, &charles.key_package(&charles_p).unwrap())
            .unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();
        Group::join(&charles_p, &add_charles.welcome, None).unwrap();
    }

    /// Alice and Bob, Bob joined from Alice's Welcome.
    fn alice_with_bob(group_id: &[u8]) -> (Provider, Group, Provider, Group) {
        let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
        let mut alice_p = alice_p;
        let mut alice_group = Group::create_new(&alice_p, &alice, group_id).unwrap();
        let add = alice_group
            .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
            .unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        let bob_group = Group::join(&bob_p, &add.welcome, None).unwrap();
        (alice_p, alice_group, bob_p, bob_group)
    }

    /// A message and a commit travel separately: one sent just before a commit can arrive after
    /// it, at a member who joined from a Welcome.
    #[test]
    fn a_message_overtaken_by_a_commit_is_read_by_a_member_who_joined() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-008");
        let sent = alice_group
            .encrypt_application(&alice_p, b"before the commit")
            .unwrap();
        let update = alice_group.update(&alice_p).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        bob_group
            .receive(&mut bob_p, &update.commit)
            .unwrap();
        let processed = bob_group.receive(&mut bob_p, &sent).unwrap();

        assert_eq!(processed.application(), b"before the commit");
    }

    /// The same at the group's founder, whose group was built rather than joined.
    #[test]
    fn a_message_overtaken_by_a_commit_is_read_by_the_founder() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-009");
        let sent = bob_group
            .encrypt_application(&bob_p, b"before the commit")
            .unwrap();
        let update = bob_group.update(&bob_p).unwrap();
        bob_group.merge_pending_commit(&mut bob_p).unwrap();

        alice_group
            .receive(&mut alice_p, &update.commit)
            .unwrap();
        let processed = alice_group.receive(&mut alice_p, &sent).unwrap();

        assert_eq!(processed.application(), b"before the commit");
    }

    /// The window's edge: five commits behind is still read. Six is refused, which the TS suite
    /// checks — an `Err` here is a `JsError`, which panics off wasm.
    #[test]
    fn a_message_five_commits_behind_is_still_read() {
        let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-010");
        let sent = alice_group
            .encrypt_application(&alice_p, b"five behind")
            .unwrap();

        for _ in 0..5 {
            let update = alice_group.update(&alice_p).unwrap();
            alice_group.merge_pending_commit(&mut alice_p).unwrap();
            bob_group
                .receive(&mut bob_p, &update.commit)
                .unwrap();
        }
        let processed = bob_group.receive(&mut bob_p, &sent).unwrap();

        assert_eq!(processed.application(), b"five behind");
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
        let processed = rejoined.receive(&mut bob_p, &ciphertext).unwrap();
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
        let processed = bob_group.receive(&mut bob_p_mut, &ciphertext).unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Application));
        assert_eq!(processed.application(), plaintext);
    }

    /// Three-member group: alice adds bob, then alice adds charles. Bob
    /// processes alice's add-charles commit; all three can decrypt the
    /// same message.
    #[test]
    fn three_member_fanout() {
        let alice_p = Provider::new();
        let alice = identity(&alice_p, b"alice");
        let bob_p = Provider::new();
        let bob = identity(&bob_p, b"bob");
        let charles_p = Provider::new();
        let charles = identity(&charles_p, b"charles");

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
            .receive(&mut bob_p_mut, &add_charles.commit)
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
            let p = group.receive(prov, &ct).unwrap();
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
        let processed = bob_group.receive(&mut bob_p_mut, &upd.commit).unwrap();
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
        let processed = bob_group.receive(&mut bob_p_mut, &ct).unwrap();
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
        let processed = bob_loaded.receive(&mut restored_p_mut, &ct).unwrap();
        assert!(matches!(processed.kind(), ProcessedKind::Application));
        assert_eq!(processed.application(), b"after-reload");
    }
}
