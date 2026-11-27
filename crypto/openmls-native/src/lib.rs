//! The uniffi facade of `openmls-core`: the engine's objects for the mobile app's Kotlin, bytes as
//! byte arrays, every `MlsError` an `MlsFailure` (`crypto/README.md`). No rule lives here. Each
//! object's state sits in a `Mutex`, as uniffi shares objects by `Arc`; every call comes from the
//! JS thread, so the locks are never contended. Statics are functions: a uniffi constructor can't
//! answer `None` nor another type.

use std::sync::{Arc, Mutex, MutexGuard};

use openmls_core::{self as mls, IncomingGroupInfo, IncomingMessage, IncomingWelcome, MlsError, RatchetTree};

mod kdf;

pub use kdf::argon2id;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum MlsFailure {
    #[error("{0}")]
    Malformed(String),
    #[error("{0}")]
    Refused(String),
    #[error("{0}")]
    State(String),
}

impl From<MlsError> for MlsFailure {
    fn from(error: MlsError) -> Self {
        let message = error.to_string();
        match error {
            MlsError::Malformed { .. } => Self::Malformed(message),
            MlsError::Refused { .. } => Self::Refused(message),
            MlsError::State(_) => Self::State(message),
        }
    }
}

type Result<T> = std::result::Result<T, MlsFailure>;

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| MlsFailure::State("A native MLS object was left broken by an earlier panic".to_owned()))
}

// ─── Provider ────────────────────────────────────────────────────────────────

#[derive(uniffi::Object)]
pub struct Provider(mls::Provider);

#[uniffi::export]
impl Provider {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self(mls::Provider::new()))
    }

    pub fn serialize_storage(&self) -> Result<Vec<u8>> {
        Ok(self.0.serialize_storage()?)
    }

    pub fn deserialize_storage(&self, bytes: Vec<u8>) -> Result<()> {
        Ok(self.0.deserialize_storage(&bytes)?)
    }
}

// ─── Identity and KeyPackage ─────────────────────────────────────────────────

#[derive(uniffi::Object)]
pub struct Identity(mls::Identity);

#[uniffi::export]
impl Identity {
    pub fn key_package(&self, provider: Arc<Provider>) -> Result<Arc<KeyPackage>> {
        Ok(Arc::new(KeyPackage(self.0.key_package(&provider.0)?)))
    }

    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.signature_public_key()
    }
}

#[uniffi::export]
pub fn identity_generate_signature_key(provider: Arc<Provider>) -> Result<Vec<u8>> {
    Ok(mls::Identity::generate_signature_key(&provider.0)?)
}

#[uniffi::export]
pub fn identity_bind(provider: Arc<Provider>, credential: Vec<u8>, signature_public_key: Vec<u8>) -> Result<Arc<Identity>> {
    Ok(Arc::new(Identity(mls::Identity::bind(&provider.0, &credential, signature_public_key)?)))
}

#[derive(uniffi::Object)]
pub struct KeyPackage(mls::KeyPackage);

#[uniffi::export]
impl KeyPackage {
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        Ok(self.0.to_bytes()?)
    }

    pub fn credential_bytes(&self) -> Vec<u8> {
        self.0.credential_bytes()
    }

    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.signature_public_key()
    }
}

#[uniffi::export]
pub fn key_package_from_bytes(bytes: Vec<u8>) -> Result<Arc<KeyPackage>> {
    Ok(Arc::new(KeyPackage(mls::KeyPackage::parse(&bytes)?)))
}

// ─── What a group makes ──────────────────────────────────────────────────────

#[derive(uniffi::Record)]
pub struct AddOutput {
    pub commit: Vec<u8>,
    pub welcome: Vec<u8>,
    pub group_info: Vec<u8>,
}

#[derive(uniffi::Record)]
pub struct CommitOutput {
    pub commit: Vec<u8>,
    pub group_info: Vec<u8>,
}

impl From<mls::CommitOutput> for CommitOutput {
    fn from(out: mls::CommitOutput) -> Self {
        Self { commit: out.commit, group_info: out.group_info }
    }
}

#[derive(uniffi::Record)]
pub struct GroupMember {
    pub leaf_index: u32,
    pub credential_bytes: Vec<u8>,
    pub signature_public_key: Vec<u8>,
}

impl From<mls::GroupMember> for GroupMember {
    fn from(member: mls::GroupMember) -> Self {
        Self {
            leaf_index: member.leaf_index(),
            credential_bytes: member.credential_bytes(),
            signature_public_key: member.signature_public_key(),
        }
    }
}

#[derive(uniffi::Enum, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessedKind {
    Application,
    Proposal,
    Commit,
}

impl From<mls::ProcessedKind> for ProcessedKind {
    fn from(kind: mls::ProcessedKind) -> Self {
        match kind {
            mls::ProcessedKind::Application => Self::Application,
            mls::ProcessedKind::Proposal => Self::Proposal,
            mls::ProcessedKind::Commit => Self::Commit,
        }
    }
}

#[derive(uniffi::Object)]
pub struct ProcessedMessage(Mutex<mls::ProcessedMessage>);

#[uniffi::export]
impl ProcessedMessage {
    pub fn kind(&self) -> Result<ProcessedKind> {
        Ok(lock(&self.0)?.kind().into())
    }

    pub fn application(&self) -> Result<Vec<u8>> {
        Ok(lock(&self.0)?.application())
    }

    pub fn leaves_met(&self) -> Result<Vec<GroupMember>> {
        Ok(lock(&self.0)?.leaves_met().into_iter().map(Into::into).collect())
    }

    pub fn joiner(&self) -> Result<Option<GroupMember>> {
        Ok(lock(&self.0)?.joiner().map(Into::into))
    }

    pub fn removed(&self) -> Result<Vec<GroupMember>> {
        Ok(lock(&self.0)?.removed().into_iter().map(Into::into).collect())
    }
}

#[derive(uniffi::Object)]
pub struct ExternalJoin(Mutex<Option<mls::ExternalJoin>>);

impl ExternalJoin {
    fn read<T>(&self, read: impl FnOnce(&mls::ExternalJoin) -> T) -> Result<T> {
        lock(&self.0)?
            .as_ref()
            .map(read)
            .ok_or_else(|| MlsFailure::State("The join's group was taken already".to_owned()))
    }
}

#[uniffi::export]
impl ExternalJoin {
    pub fn commit(&self) -> Result<Vec<u8>> {
        self.read(mls::ExternalJoin::commit)
    }

    pub fn group_info(&self) -> Result<Vec<u8>> {
        self.read(mls::ExternalJoin::group_info)
    }

    pub fn epoch(&self) -> Result<u64> {
        self.read(mls::ExternalJoin::epoch)
    }

    pub fn into_group(&self) -> Result<Arc<Group>> {
        lock(&self.0)?
            .take()
            .map(|join| Group::wrap(join.into_group()))
            .ok_or_else(|| MlsFailure::State("The join's group was taken already".to_owned()))
    }
}

// ─── Group ───────────────────────────────────────────────────────────────────

#[derive(uniffi::Object)]
pub struct Group(Mutex<mls::Group>);

impl Group {
    fn wrap(group: mls::Group) -> Arc<Self> {
        Arc::new(Self(Mutex::new(group)))
    }
}

#[uniffi::export]
impl Group {
    pub fn rejoin(&self, provider: Arc<Provider>, welcome: Vec<u8>) -> Result<Option<Arc<Group>>> {
        let welcome = IncomingWelcome::parse(&welcome)?;
        Ok(lock(&self.0)?.rejoin(&provider.0, welcome)?.map(Group::wrap))
    }

    pub fn delete(&self, provider: Arc<Provider>) -> Result<()> {
        Ok(lock(&self.0)?.delete(&provider.0)?)
    }

    pub fn export_ratchet_tree(&self) -> Result<Vec<u8>> {
        Ok(lock(&self.0)?.export_ratchet_tree()?)
    }

    pub fn list_members(&self) -> Result<Vec<GroupMember>> {
        Ok(lock(&self.0)?.list_members().into_iter().map(Into::into).collect())
    }

    pub fn own_leaf_index(&self) -> Result<u32> {
        Ok(lock(&self.0)?.own_leaf_index())
    }

    pub fn epoch(&self) -> Result<u64> {
        Ok(lock(&self.0)?.epoch())
    }

    pub fn add_member(&self, provider: Arc<Provider>, key_package: Arc<KeyPackage>) -> Result<AddOutput> {
        let out = lock(&self.0)?.add_member(&provider.0, &key_package.0)?;
        Ok(AddOutput { commit: out.commit, welcome: out.welcome, group_info: out.group_info })
    }

    pub fn remove_member(&self, provider: Arc<Provider>, leaf_index: u32) -> Result<CommitOutput> {
        Ok(lock(&self.0)?.remove_member(&provider.0, leaf_index)?.into())
    }

    pub fn update(&self, provider: Arc<Provider>) -> Result<CommitOutput> {
        Ok(lock(&self.0)?.update(&provider.0)?.into())
    }

    pub fn update_credential(&self, provider: Arc<Provider>, credential: Vec<u8>) -> Result<CommitOutput> {
        Ok(lock(&self.0)?.update_credential(&provider.0, &credential)?.into())
    }

    pub fn merge_pending_commit(&self, provider: Arc<Provider>) -> Result<()> {
        Ok(lock(&self.0)?.merge_pending_commit(&provider.0)?)
    }

    pub fn clear_pending_commit(&self, provider: Arc<Provider>) -> Result<()> {
        Ok(lock(&self.0)?.clear_pending_commit(&provider.0)?)
    }

    pub fn encrypt_application(&self, provider: Arc<Provider>, plaintext: Vec<u8>) -> Result<Vec<u8>> {
        Ok(lock(&self.0)?.encrypt_application(&provider.0, &plaintext)?)
    }

    pub fn process_message(&self, provider: Arc<Provider>, message: Vec<u8>) -> Result<Arc<ProcessedMessage>> {
        let message = IncomingMessage::parse(&message)?;
        let processed = lock(&self.0)?.process_message(&provider.0, message)?;
        Ok(Arc::new(ProcessedMessage(Mutex::new(processed))))
    }

    /// Locks the group, then the message.
    pub fn apply_commit(&self, provider: Arc<Provider>, processed: Arc<ProcessedMessage>) -> Result<()> {
        let mut group = lock(&self.0)?;
        Ok(group.apply_commit(&provider.0, &mut *lock(&processed.0)?)?)
    }

    pub fn export_secret(&self, provider: Arc<Provider>, label: String, context: Vec<u8>, key_length: u32) -> Result<Vec<u8>> {
        Ok(lock(&self.0)?.export_secret(&provider.0, &label, &context, key_length as usize)?)
    }
}

#[uniffi::export]
pub fn group_create_new(provider: Arc<Provider>, founder: Arc<Identity>, group_id: Vec<u8>) -> Result<Arc<Group>> {
    Ok(Group::wrap(mls::Group::create_new(&provider.0, &founder.0, &group_id)?))
}

#[uniffi::export]
pub fn group_load_from_provider(provider: Arc<Provider>, group_id: Vec<u8>) -> Result<Option<Arc<Group>>> {
    Ok(mls::Group::load_from_provider(&provider.0, &group_id)?.map(Group::wrap))
}

#[uniffi::export]
pub fn group_join(provider: Arc<Provider>, welcome: Vec<u8>, ratchet_tree: Option<Vec<u8>>) -> Result<Arc<Group>> {
    let welcome = IncomingWelcome::parse(&welcome)?;
    let tree = ratchet_tree.as_deref().map(RatchetTree::parse).transpose()?;
    Ok(Group::wrap(mls::Group::join(&provider.0, welcome, tree)?))
}

#[uniffi::export]
pub fn group_join_by_external_commit(
    provider: Arc<Provider>,
    identity: Arc<Identity>,
    group_id: Vec<u8>,
    group_info: Vec<u8>,
) -> Result<Arc<ExternalJoin>> {
    let group_info = IncomingGroupInfo::parse(&group_info)?;
    let join = mls::Group::join_by_external_commit(&provider.0, &identity.0, &group_id, group_info)?;
    Ok(Arc::new(ExternalJoin(Mutex::new(Some(join)))))
}

// ─── HPKE ────────────────────────────────────────────────────────────────────

#[derive(uniffi::Record)]
pub struct HpkeKeyPair {
    pub public_key: Vec<u8>,
    pub private_key: Vec<u8>,
}

#[derive(uniffi::Record)]
pub struct HpkeSealed {
    pub enc: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

#[uniffi::export]
pub fn hpke_generate_key_pair() -> Result<HpkeKeyPair> {
    let pair = mls::hpke::generate()?;
    Ok(HpkeKeyPair { public_key: pair.public_key, private_key: pair.private_key.to_vec() })
}

#[uniffi::export]
pub fn hpke_seal(public_key: Vec<u8>, info: Vec<u8>, aad: Vec<u8>, plaintext: Vec<u8>) -> Result<HpkeSealed> {
    let sealed = mls::hpke::seal(&public_key, &info, &aad, &plaintext)?;
    Ok(HpkeSealed { enc: sealed.enc, ciphertext: sealed.ciphertext })
}

#[uniffi::export]
pub fn hpke_open(private_key: Vec<u8>, enc: Vec<u8>, ciphertext: Vec<u8>, info: Vec<u8>, aad: Vec<u8>) -> Result<Vec<u8>> {
    Ok(mls::hpke::open(&private_key, &enc, &ciphertext, &info, &aad)?)
}

#[cfg(test)]
mod tests;
