//! A message received: an application message read, a proposal dropped, a commit staged until
//! [`Group::apply_commit`] merges it.

use openmls::{
    framing::{ProcessedMessageContent, Sender},
    group::StagedCommit,
};

use crate::{Group, GroupMember, IncomingMessage, MlsError, Provider};

/// Categorises the outcome of `Group::process_message` so callers can route
/// the result without inspecting MLS internals. Mirrors openmls's
/// `ProcessedMessageContent`.
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

    pub fn kind(&self) -> ProcessedKind {
        self.kind
    }

    /// The decrypted plaintext when `kind == Application`. Empty otherwise.
    pub fn application(&self) -> Vec<u8> {
        self.application.clone()
    }

    /// For a commit once applied: the leaves it brought in or replaced — added, a device committing
    /// itself in, or the committer's own changed by its path —, this device's own left out. Empty
    /// otherwise.
    pub fn leaves_met(&self) -> Vec<GroupMember> {
        self.leaves_met.clone()
    }

    /// For an external commit — a device committing itself in, its sender a `new_member_commit`:
    /// the leaf it brings in, at the index it takes. `None` for any other message.
    pub fn joiner(&self) -> Option<GroupMember> {
        self.joiner.clone()
    }

    /// For a commit: the leaves it removes, as they stand before it. RFC 9420 § 12.4.3.2 leaves an
    /// external commit's removals to the application to accept. Empty otherwise.
    pub fn removed(&self) -> Vec<GroupMember> {
        self.removed.clone()
    }
}

impl Group {
    /// Process any inbound MLS message — application, proposal, or commit. Application messages
    /// return their plaintext; proposals are ignored. A commit is checked and staged, not merged:
    /// it shows its joiner and the leaves it removes, and [`Group::apply_commit`] merges it.
    pub fn process_message(&mut self, provider: &Provider, message: IncomingMessage) -> Result<ProcessedMessage, MlsError> {
        let processed = self
            .mls_group
            .process_message(&provider.0, message.0)
            .map_err(|e| MlsError::refused("Message processing", e))?;
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
    pub fn apply_commit(&mut self, provider: &Provider, processed: &mut ProcessedMessage) -> Result<(), MlsError> {
        let staged = processed
            .staged
            .take()
            .ok_or(MlsError::State("No commit to apply"))?;
        let before = self.list_members();
        self.mls_group
            .merge_staged_commit(&provider.0, *staged)
            .map_err(|e| MlsError::refused("Commit merge", e))?;
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
}

#[cfg(test)]
mod tests;
