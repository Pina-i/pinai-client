//! A conversation's MLS group: founded, joined, committed to, written in. What it receives is
//! `processed.rs`'s.

use openmls::{
    credentials::{BasicCredential, CredentialWithKey},
    framing::MlsMessageOut,
    group::{CommitBuilder, GroupId, Initial, MlsGroup, StagedWelcome},
    prelude::{LeafNodeIndex, LeafNodeParameters, SignatureScheme},
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_traits::OpenMlsProvider;
use tls_codec::Serialize;

use crate::config::{join_config, CIPHERSUITE, MAX_PAST_EPOCHS};
use crate::wire::serialize_message;
use crate::{Identity, IncomingGroupInfo, IncomingWelcome, KeyPackage, MlsError, Provider, RatchetTree};

/// MLS group state for one conversation. The IdP's `conversation_id`
/// (UUID) is what's passed as `group_id` so server and client agree on
/// the mapping.
pub struct Group {
    pub(crate) mls_group: MlsGroup,
}

/// What [`Group::add_member`] makes: `commit` and `group_info` go to the DS, `welcome` to the
/// new member.
pub struct AddOutput {
    pub commit: Vec<u8>,
    pub welcome: Vec<u8>,
    /// The GroupInfo of the epoch the commit opens, as an `MlsMessage`: what a device joins by on
    /// its own ([`Group::join_by_external_commit`]).
    pub group_info: Vec<u8>,
}

/// What `remove_member`, `update` and `update_credential` make.
pub struct CommitOutput {
    pub commit: Vec<u8>,
    pub group_info: Vec<u8>,
}

/// A device's join by external commit, pending until the DS takes the commit: the group, the
/// commit adding this device, and the GroupInfo of the epoch it opens.
pub struct ExternalJoin {
    group: Group,
    commit: Vec<u8>,
    group_info: Vec<u8>,
}

impl ExternalJoin {
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }

    pub fn group_info(&self) -> Vec<u8> {
        self.group_info.clone()
    }

    /// The epoch the commit opens, which it is posted at.
    pub fn epoch(&self) -> u64 {
        self.group.epoch()
    }

    pub fn into_group(self) -> Group {
        self.group
    }
}

/// One leaf in the MLS tree: its index, its credential's identity bytes, its signature key.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct GroupMember {
    pub(crate) leaf_index: u32,
    pub(crate) credential_bytes: Vec<u8>,
    pub(crate) signature_public_key: Vec<u8>,
}

impl GroupMember {
    pub fn leaf_index(&self) -> u32 {
        self.leaf_index
    }

    pub fn credential_bytes(&self) -> Vec<u8> {
        self.credential_bytes.clone()
    }

    pub fn signature_public_key(&self) -> Vec<u8> {
        self.signature_public_key.clone()
    }
}

/// What a commit of this device's produces.
struct Committed {
    commit: Vec<u8>,
    welcome: Option<MlsMessageOut>,
    group_info: Vec<u8>,
}

/// Rows the provider holds under `id` that no group held stands for — a join by external commit
/// never kept: deleted, or a join over them would find a group already there.
fn delete_stale(provider: &Provider, id: &GroupId) -> Result<(), MlsError> {
    if let Some(mut stale) = MlsGroup::load(provider.0.storage(), id)
        .map_err(|e| MlsError::refused("Group load", format!("{e:?}")))?
    {
        stale
            .delete(provider.0.storage())
            .map_err(|e| MlsError::refused("Group delete", format!("{e:?}")))?;
    }
    Ok(())
}

impl Group {
    /// Create a brand-new group. The founder is automatically the only
    /// member. To bring in others, call [`Group::add_member`] and dispatch
    /// the resulting `welcome` to each.
    pub fn create_new(provider: &Provider, founder: &Identity, group_id: &[u8]) -> Result<Group, MlsError> {
        let signer = founder.signer(provider)?;
        let mls_group = MlsGroup::builder()
            .ciphersuite(CIPHERSUITE)
            // As every member's Welcomes do (`join_config`): a joiner needs nothing else.
            .use_ratchet_tree_extension(true)
            .max_past_epochs(MAX_PAST_EPOCHS)
            .with_group_id(GroupId::from_slice(group_id))
            .build(&provider.0, &signer, founder.credential_with_key.clone())
            .map_err(|e| MlsError::refused("Group creation", e))?;
        Ok(Group { mls_group })
    }

    /// Re-hydrate a group from the provider's persisted storage, once
    /// [`Provider::deserialize_storage`] has restored it. `None` when the provider holds no group
    /// with that id.
    pub fn load_from_provider(provider: &Provider, group_id: &[u8]) -> Result<Option<Group>, MlsError> {
        let id = GroupId::from_slice(group_id);
        let Some(mut mls_group) = MlsGroup::load(provider.0.storage(), &id)
            .map_err(|e| MlsError::refused("Group load", format!("{e:?}")))?
        else {
            return Ok(None);
        };
        // Joined while Welcomes went without the ratchet tree: the next one it sent would leave
        // its joiner unable to build the group.
        if mls_group.configuration() != &join_config() {
            mls_group
                .set_configuration(provider.0.storage(), &join_config())
                .map_err(|e| MlsError::refused("Group configuration update", format!("{e:?}")))?;
        }
        Ok(Some(Group { mls_group }))
    }

    /// Build a group from a Welcome we received, with the ratchet tree when it came apart. Rows
    /// the provider still holds under that group id — a join by external commit never kept — are
    /// deleted first. Like every join, it checks no leaf's lifetime (`crypto/README.md`).
    pub fn join(
        provider: &Provider,
        welcome: IncomingWelcome,
        ratchet_tree: Option<RatchetTree>,
    ) -> Result<Group, MlsError> {
        let mut join = StagedWelcome::build_from_welcome(&provider.0, &join_config(), welcome.0)
            .map_err(|e| MlsError::refused("Welcome", e))?
            .skip_lifetime_validation();
        if let Some(tree) = ratchet_tree {
            join = join.with_ratchet_tree(tree.0);
        }
        let group_id = join.processed_welcome().unverified_group_info().group_id().clone();
        delete_stale(provider, &group_id)?;
        let mls_group = join
            .build()
            .map_err(|e| MlsError::refused("Welcome", e))?
            .into_group(&provider.0)
            .map_err(|e| MlsError::refused("Group join", e))?;
        Ok(Group { mls_group })
    }

    /// Join `group_id` from a GroupInfo of it, by an external commit adding this device's leaf:
    /// `identity`'s credential over its key, as its KeyPackages carry. openmls merges the commit as
    /// it makes it, so the group is the caller's to keep once the DS took the commit, or to
    /// [`Group::delete`] once refused. Rows the provider still holds under that id — a join never
    /// kept — are deleted first. Like every join, it checks no leaf's lifetime (`crypto/README.md`).
    pub fn join_by_external_commit(
        provider: &Provider,
        identity: &Identity,
        group_id: &[u8],
        group_info: IncomingGroupInfo,
    ) -> Result<ExternalJoin, MlsError> {
        let id = GroupId::from_slice(group_id);
        if group_info.0.group_id() != &id {
            return Err(MlsError::malformed("GroupInfo", "it is another group's"));
        }
        delete_stale(provider, &id)?;
        let signer = identity.signer(provider)?;
        let (mls_group, bundle) = MlsGroup::external_commit_builder()
            .with_config(join_config())
            .skip_lifetime_validation()
            .build_group(&provider.0, group_info.0, identity.credential_with_key.clone())
            .map_err(|e| MlsError::refused("External commit", e))?
            .load_psks(provider.0.storage())
            .map_err(|e| MlsError::refused("External commit", e))?
            .use_ratchet_tree_extension(true)
            .build(provider.0.rand(), provider.0.crypto(), &signer, |_| true)
            .map_err(|e| MlsError::refused("External commit", e))?
            .finalize(&provider.0)
            .map_err(|e| MlsError::refused("External commit", e))?;
        let (commit, _, group_info) = bundle.into_messages();
        let group_info =
            group_info.ok_or_else(|| MlsError::refused("External commit", "it made no GroupInfo"))?;
        Ok(ExternalJoin {
            group: Group { mls_group },
            commit: serialize_message(&commit)?,
            group_info: serialize_message(&group_info)?,
        })
    }

    /// Join again from a Welcome for this group — the device was committed out and added back.
    /// The group held is replaced only when the Welcome brings a later epoch; `None` keeps it, as
    /// for a Welcome from a group both sides founded at once. Like every join, it checks no leaf's
    /// lifetime (`crypto/README.md`).
    pub fn rejoin(&mut self, provider: &Provider, welcome: IncomingWelcome) -> Result<Option<Group>, MlsError> {
        let staged = StagedWelcome::build_from_welcome(&provider.0, &join_config(), welcome.0)
            .and_then(|join| join.replace_old_group().skip_lifetime_validation().build())
            .map_err(|e| MlsError::refused("Welcome", e))?;
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
            .map_err(|e| MlsError::refused("Group join", e))?;
        Ok(Some(Group { mls_group }))
    }

    /// Remove the group's state from the provider, as a group the user was removed from is cleared.
    pub fn delete(&mut self, provider: &Provider) -> Result<(), MlsError> {
        self.mls_group
            .delete(provider.0.storage())
            .map_err(|e| MlsError::refused("Group delete", format!("{e:?}")))
    }

    /// The keypair of the group's own leaf, which peers verify this device's messages and commits
    /// against — not necessarily the identity bound since: a KeyPackage published before a reload
    /// carries the key of its day.
    pub(crate) fn signer(&self, provider: &Provider) -> Result<SignatureKeyPair, MlsError> {
        let leaf = self
            .mls_group
            .own_leaf_node()
            .ok_or(MlsError::State("The group holds no leaf of this device"))?;
        SignatureKeyPair::read(
            provider.0.storage(),
            leaf.signature_key().as_slice(),
            SignatureScheme::ED25519,
        )
        .ok_or(MlsError::State("The signing keypair of this device's leaf is missing from storage"))
    }

    /// The ratchet tree, for a joiner to build the group alongside its Welcome. Not confidential:
    /// redacted by design.
    pub fn export_ratchet_tree(&self) -> Result<Vec<u8>, MlsError> {
        let mut out = vec![];
        self.mls_group
            .export_ratchet_tree()
            .tls_serialize(&mut out)
            .map_err(|e| MlsError::refused("Ratchet tree serialization", e))?;
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
    pub fn add_member(&mut self, provider: &Provider, new_member: &KeyPackage) -> Result<AddOutput, MlsError> {
        let committed = self.commit(provider, |builder| {
            builder
                .propose_adds([new_member.0.clone()])
                .force_self_update(true)
        })?;
        let welcome = committed
            .welcome
            .ok_or_else(|| MlsError::refused("Add", "it made no Welcome"))?;
        Ok(AddOutput {
            commit: committed.commit,
            welcome: serialize_message(&welcome)?,
            group_info: committed.group_info,
        })
    }

    /// Remove the leaf at `member_index`, an index of [`Group::list_members`].
    pub fn remove_member(&mut self, provider: &Provider, member_index: u32) -> Result<CommitOutput, MlsError> {
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
    pub fn update(&mut self, provider: &Provider) -> Result<CommitOutput, MlsError> {
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
    pub fn update_credential(&mut self, provider: &Provider, credential: &[u8]) -> Result<CommitOutput, MlsError> {
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
    ) -> Result<Committed, MlsError> {
        if !self.mls_group.is_active() {
            return Err(MlsError::State("This device is no longer in the group"));
        }
        if self.mls_group.pending_commit().is_some() {
            return Err(MlsError::State("A commit of this group is still pending"));
        }
        let signer = self.signer(provider)?;
        let bundle = build(self.mls_group.commit_builder().consume_proposal_store(false))
            .load_psks(provider.0.storage())
            .map_err(|e| MlsError::refused("Commit", e))?
            .use_ratchet_tree_extension(true)
            .build(provider.0.rand(), provider.0.crypto(), &signer, |_| true)
            .map_err(|e| MlsError::refused("Commit", e))?
            .stage_commit(&provider.0)
            .map_err(|e| MlsError::refused("Commit", e))?;
        let welcome = bundle.to_welcome_msg();
        let (commit, _, group_info) = bundle.into_messages();
        let group_info = group_info.ok_or_else(|| MlsError::refused("Commit", "it made no GroupInfo"))?;
        Ok(Committed {
            commit: serialize_message(&commit)?,
            welcome,
            group_info: serialize_message(&group_info)?,
        })
    }

    /// Merge the pending commit (the one built locally for `add_member`,
    /// `remove_member`, or `update`). Call only after the IdP DS confirmed
    /// the commit landed at the proposed epoch.
    pub fn merge_pending_commit(&mut self, provider: &Provider) -> Result<(), MlsError> {
        self.mls_group
            .merge_pending_commit(&provider.0)
            .map_err(|e| MlsError::refused("Pending commit merge", e))
    }

    /// Drop the pending commit — one the IdP DS refused or never acknowledged. The group builds no
    /// other commit while one is pending.
    pub fn clear_pending_commit(&mut self, provider: &Provider) -> Result<(), MlsError> {
        self.mls_group
            .clear_pending_commit(provider.0.storage())
            .map_err(|e| MlsError::refused("Pending commit clearing", format!("{e:?}")))
    }

    /// Encrypt an application message (text DM, reaction, edit — the
    /// kind-byte lives inside `plaintext`).
    pub fn encrypt_application(&mut self, provider: &Provider, plaintext: &[u8]) -> Result<Vec<u8>, MlsError> {
        let signer = self.signer(provider)?;
        let message = self
            .mls_group
            .create_message(&provider.0, &signer, plaintext)
            .map_err(|e| MlsError::refused("Application message", e))?;
        serialize_message(&message)
    }

    /// Derive a `key_length`-byte secret bound to `(label, context)` from the current epoch.
    pub fn export_secret(
        &self,
        provider: &Provider,
        label: &str,
        context: &[u8],
        key_length: usize,
    ) -> Result<Vec<u8>, MlsError> {
        self.mls_group
            .export_secret(provider.0.crypto(), label, context, key_length)
            .map_err(|e| MlsError::refused("Secret export", e))
    }
}

#[cfg(test)]
mod tests;
