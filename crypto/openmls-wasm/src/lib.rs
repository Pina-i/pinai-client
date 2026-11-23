//! The wasm-bindgen facade of `openmls-core`: the engine's objects as the web client calls them,
//! bytes as `Uint8Array`, every `MlsError` thrown as an `Error` (`crypto/README.md`). No rule
//! lives here: what a facade does, both platforms must agree on, so it goes in the core.

use openmls_core::{self as mls, IncomingGroupInfo, IncomingMessage, IncomingWelcome, MlsError, RatchetTree};
use wasm_bindgen::prelude::*;

pub mod hpke;

fn js(error: MlsError) -> JsError {
    JsError::new(&error.to_string())
}

/// Mounts the panic hook, so a Rust panic shows its message rather than `unreachable executed`.
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
#[derive(Default)]
pub struct Provider(mls::Provider);

#[wasm_bindgen]
impl Provider {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn serialize_storage(&self) -> Result<Vec<u8>, JsError> {
        self.0.serialize_storage().map_err(js)
    }

    pub fn deserialize_storage(&self, bytes: &[u8]) -> Result<(), JsError> {
        self.0.deserialize_storage(bytes).map_err(js)
    }
}

#[wasm_bindgen]
pub struct Identity(mls::Identity);

#[wasm_bindgen]
impl Identity {
    pub fn generate_signature_key(provider: &Provider) -> Result<Vec<u8>, JsError> {
        mls::Identity::generate_signature_key(&provider.0).map_err(js)
    }

    pub fn bind(
        provider: &Provider,
        credential: &[u8],
        signature_public_key: Vec<u8>,
    ) -> Result<Identity, JsError> {
        mls::Identity::bind(&provider.0, credential, signature_public_key)
            .map(Identity)
            .map_err(js)
    }

    pub fn key_package(&self, provider: &Provider) -> Result<KeyPackage, JsError> {
        self.0.key_package(&provider.0).map(KeyPackage).map_err(js)
    }

    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.signature_public_key()
    }
}

#[wasm_bindgen]
pub struct KeyPackage(mls::KeyPackage);

#[wasm_bindgen]
impl KeyPackage {
    pub fn to_bytes(&self) -> Result<Vec<u8>, JsError> {
        self.0.to_bytes().map_err(js)
    }

    pub fn credential_bytes(&self) -> Vec<u8> {
        self.0.credential_bytes()
    }

    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.signature_public_key()
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<KeyPackage, JsError> {
        mls::KeyPackage::parse(bytes).map(KeyPackage).map_err(js)
    }
}

#[wasm_bindgen]
pub struct AddOutput(mls::AddOutput);

#[wasm_bindgen]
impl AddOutput {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.0.commit.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn welcome(&self) -> Vec<u8> {
        self.0.welcome.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.0.group_info.clone()
    }
}

#[wasm_bindgen]
pub struct CommitOutput(mls::CommitOutput);

#[wasm_bindgen]
impl CommitOutput {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.0.commit.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.0.group_info.clone()
    }
}

#[wasm_bindgen]
pub struct ExternalJoin(mls::ExternalJoin);

#[wasm_bindgen]
impl ExternalJoin {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.0.commit()
    }
    #[wasm_bindgen(getter)]
    pub fn group_info(&self) -> Vec<u8> {
        self.0.group_info()
    }
    #[wasm_bindgen(getter)]
    pub fn epoch(&self) -> u64 {
        self.0.epoch()
    }
    pub fn into_group(self) -> Group {
        Group(self.0.into_group())
    }
}

#[wasm_bindgen]
pub struct GroupMember(mls::GroupMember);

#[wasm_bindgen]
impl GroupMember {
    #[wasm_bindgen(getter)]
    pub fn leaf_index(&self) -> u32 {
        self.0.leaf_index()
    }
    #[wasm_bindgen(getter)]
    pub fn credential_bytes(&self) -> Vec<u8> {
        self.0.credential_bytes()
    }
    #[wasm_bindgen(getter)]
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.signature_public_key()
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProcessedKind {
    Application,
    Proposal,
    Commit,
}

impl From<mls::ProcessedKind> for ProcessedKind {
    fn from(kind: mls::ProcessedKind) -> Self {
        match kind {
            mls::ProcessedKind::Application => ProcessedKind::Application,
            mls::ProcessedKind::Proposal => ProcessedKind::Proposal,
            mls::ProcessedKind::Commit => ProcessedKind::Commit,
        }
    }
}

#[wasm_bindgen]
pub struct ProcessedMessage(mls::ProcessedMessage);

#[wasm_bindgen]
impl ProcessedMessage {
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> ProcessedKind {
        self.0.kind().into()
    }
    #[wasm_bindgen(getter)]
    pub fn application(&self) -> Vec<u8> {
        self.0.application()
    }
    #[wasm_bindgen(getter)]
    pub fn leaves_met(&self) -> Vec<GroupMember> {
        self.0.leaves_met().into_iter().map(GroupMember).collect()
    }
    #[wasm_bindgen(getter)]
    pub fn joiner(&self) -> Option<GroupMember> {
        self.0.joiner().map(GroupMember)
    }
    #[wasm_bindgen(getter)]
    pub fn removed(&self) -> Vec<GroupMember> {
        self.0.removed().into_iter().map(GroupMember).collect()
    }
}

#[wasm_bindgen]
pub struct Group(mls::Group);

#[wasm_bindgen]
impl Group {
    pub fn create_new(provider: &Provider, founder: &Identity, group_id: &[u8]) -> Result<Group, JsError> {
        mls::Group::create_new(&provider.0, &founder.0, group_id)
            .map(Group)
            .map_err(js)
    }

    /// `undefined` when the provider holds no group with that id.
    pub fn load_from_provider(provider: &Provider, group_id: &[u8]) -> Result<Option<Group>, JsError> {
        mls::Group::load_from_provider(&provider.0, group_id)
            .map(|group| group.map(Group))
            .map_err(js)
    }

    pub fn join(
        provider: &Provider,
        welcome_bytes: &[u8],
        ratchet_tree_bytes: Option<Vec<u8>>,
    ) -> Result<Group, JsError> {
        let welcome = IncomingWelcome::parse(welcome_bytes).map_err(js)?;
        let tree = ratchet_tree_bytes
            .as_deref()
            .map(RatchetTree::parse)
            .transpose()
            .map_err(js)?;
        mls::Group::join(&provider.0, welcome, tree).map(Group).map_err(js)
    }

    pub fn join_by_external_commit(
        provider: &Provider,
        identity: &Identity,
        group_id: &[u8],
        group_info_bytes: &[u8],
    ) -> Result<ExternalJoin, JsError> {
        let group_info = IncomingGroupInfo::parse(group_info_bytes).map_err(js)?;
        mls::Group::join_by_external_commit(&provider.0, &identity.0, group_id, group_info)
            .map(ExternalJoin)
            .map_err(js)
    }

    /// `undefined` keeps the group held: the Welcome brought no later epoch.
    pub fn rejoin(&mut self, provider: &Provider, welcome_bytes: &[u8]) -> Result<Option<Group>, JsError> {
        let welcome = IncomingWelcome::parse(welcome_bytes).map_err(js)?;
        self.0
            .rejoin(&provider.0, welcome)
            .map(|group| group.map(Group))
            .map_err(js)
    }

    pub fn delete(&mut self, provider: &Provider) -> Result<(), JsError> {
        self.0.delete(&provider.0).map_err(js)
    }

    pub fn export_ratchet_tree(&self) -> Result<Vec<u8>, JsError> {
        self.0.export_ratchet_tree().map_err(js)
    }

    pub fn list_members(&self) -> Vec<GroupMember> {
        self.0.list_members().into_iter().map(GroupMember).collect()
    }

    pub fn own_leaf_index(&self) -> u32 {
        self.0.own_leaf_index()
    }

    pub fn epoch(&self) -> u64 {
        self.0.epoch()
    }

    pub fn add_member(&mut self, provider: &Provider, new_member_kp: &KeyPackage) -> Result<AddOutput, JsError> {
        self.0
            .add_member(&provider.0, &new_member_kp.0)
            .map(AddOutput)
            .map_err(js)
    }

    pub fn remove_member(&mut self, provider: &Provider, member_index: u32) -> Result<CommitOutput, JsError> {
        self.0
            .remove_member(&provider.0, member_index)
            .map(CommitOutput)
            .map_err(js)
    }

    pub fn update(&mut self, provider: &Provider) -> Result<CommitOutput, JsError> {
        self.0.update(&provider.0).map(CommitOutput).map_err(js)
    }

    pub fn update_credential(&mut self, provider: &Provider, credential: &[u8]) -> Result<CommitOutput, JsError> {
        self.0
            .update_credential(&provider.0, credential)
            .map(CommitOutput)
            .map_err(js)
    }

    pub fn merge_pending_commit(&mut self, provider: &mut Provider) -> Result<(), JsError> {
        self.0.merge_pending_commit(&provider.0).map_err(js)
    }

    pub fn clear_pending_commit(&mut self, provider: &mut Provider) -> Result<(), JsError> {
        self.0.clear_pending_commit(&provider.0).map_err(js)
    }

    pub fn encrypt_application(&mut self, provider: &Provider, plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
        self.0.encrypt_application(&provider.0, plaintext).map_err(js)
    }

    pub fn process_message(&mut self, provider: &mut Provider, msg_bytes: &[u8]) -> Result<ProcessedMessage, JsError> {
        let message = IncomingMessage::parse(msg_bytes).map_err(js)?;
        self.0
            .process_message(&provider.0, message)
            .map(ProcessedMessage)
            .map_err(js)
    }

    pub fn apply_commit(&mut self, provider: &mut Provider, processed: &mut ProcessedMessage) -> Result<(), JsError> {
        self.0.apply_commit(&provider.0, &mut processed.0).map_err(js)
    }

    pub fn export_secret(
        &self,
        provider: &Provider,
        label: &str,
        context: &[u8],
        key_length: usize,
    ) -> Result<Vec<u8>, JsError> {
        self.0
            .export_secret(&provider.0, label, context, key_length)
            .map_err(js)
    }
}
