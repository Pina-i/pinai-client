use openmls::{
    credentials::{BasicCredential, CredentialWithKey},
    key_packages::{KeyPackage as OpenMlsKeyPackage, Lifetime},
    prelude::SignatureScheme,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_traits::OpenMlsProvider;

use crate::config::{CIPHERSUITE, KEY_PACKAGE_LIFETIME_SECONDS};
use crate::{KeyPackage, MlsError, Provider};

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
pub struct Identity {
    pub(crate) credential_with_key: CredentialWithKey,
    signature_public_key: Vec<u8>,
    /// Plain `u16` rather than `SignatureScheme` so the discriminant
    /// can never be transmuted from a zeroed byte and read as an
    /// invalid variant.
    signature_scheme_repr: u16,
}

impl Identity {
    /// A fresh leaf signature keypair, kept in the provider's storage: its public key, for the
    /// credential to bind before [`Identity::bind`].
    pub fn generate_signature_key(provider: &Provider) -> Result<Vec<u8>, MlsError> {
        let keypair = SignatureKeyPair::new(SignatureScheme::ED25519)
            .map_err(|e| MlsError::refused("Signature keypair generation", e))?;
        keypair
            .store(provider.0.storage())
            .map_err(|e| MlsError::refused("Signature keypair storage", e))?;
        Ok(keypair.public().to_vec())
    }

    /// Bind `credential` to a keypair already in `provider.storage()` — made by
    /// [`Identity::generate_signature_key`], or restored with a snapshot.
    pub fn bind(
        provider: &Provider,
        credential: &[u8],
        signature_public_key: Vec<u8>,
    ) -> Result<Identity, MlsError> {
        let scheme = SignatureScheme::ED25519;
        SignatureKeyPair::read(provider.0.storage(), &signature_public_key, scheme)
            .ok_or(MlsError::State("No keypair in the provider's storage for this signature key"))?;
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
    /// directory, living a year. Caller is responsible for batching these
    /// into the `POST /api/keys/packages` payload.
    pub fn key_package(&self, provider: &Provider) -> Result<KeyPackage, MlsError> {
        self.key_package_living(provider, Lifetime::new(KEY_PACKAGE_LIFETIME_SECONDS))
    }

    /// The Ed25519 public key bytes — used for fingerprinting in the UI.
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.signature_public_key.clone()
    }

    /// The signature keypair [`Identity::generate_signature_key`] stashed in the provider's
    /// storage: short-lived, never handed out.
    pub(crate) fn signer(&self, provider: &Provider) -> Result<SignatureKeyPair, MlsError> {
        let scheme = SignatureScheme::try_from(self.signature_scheme_repr)
            .map_err(|_| MlsError::State("The identity's signature scheme can't be read"))?;
        SignatureKeyPair::read(provider.0.storage(), &self.signature_public_key, scheme).ok_or(
            MlsError::State(
                "The identity's signature keypair is missing from the provider's storage; the \
                 provider likely lost state across a snapshot round-trip",
            ),
        )
    }

    pub(crate) fn key_package_living(
        &self,
        provider: &Provider,
        lifetime: Lifetime,
    ) -> Result<KeyPackage, MlsError> {
        let signer = self.signer(provider)?;
        let kp = OpenMlsKeyPackage::builder()
            .key_package_lifetime(lifetime)
            .build(CIPHERSUITE, &provider.0, &signer, self.credential_with_key.clone())
            .map_err(|e| MlsError::refused("KeyPackage build", e))?;
        Ok(KeyPackage(kp.key_package().clone()))
    }
}
