use openmls::{
    key_packages::{KeyPackage as OpenMlsKeyPackage, KeyPackageIn},
    prelude::ProtocolVersion,
};
use tls_codec::{Deserialize, Serialize};

use crate::MlsError;

/// A single-use KeyPackage: one this device made, or one claimed for another.
pub struct KeyPackage(pub(crate) OpenMlsKeyPackage);

impl KeyPackage {
    /// Validate and parse a TLS-encoded KeyPackage fetched from the IdP.
    /// Validation enforces protocol version + ciphersuite + signature + lifetime.
    pub fn parse(bytes: &[u8]) -> Result<KeyPackage, MlsError> {
        let mut s = bytes;
        let kp_in = KeyPackageIn::tls_deserialize(&mut s).map_err(|e| MlsError::malformed("KeyPackage", e))?;
        let kp = kp_in
            .validate(&openmls_rust_crypto::RustCrypto::default(), ProtocolVersion::Mls10)
            .map_err(|e| MlsError::malformed("KeyPackage", format!("{e:?}")))?;
        Ok(KeyPackage(kp))
    }

    /// TLS-encoded for upload to the IdP / cross-IdP claim.
    pub fn to_bytes(&self) -> Result<Vec<u8>, MlsError> {
        self.0
            .tls_serialize_detached()
            .map_err(|e| MlsError::refused("KeyPackage serialization", e))
    }

    /// The identity bytes of its leaf's `BasicCredential`.
    pub fn credential_bytes(&self) -> Vec<u8> {
        self.0.leaf_node().credential().serialized_content().to_vec()
    }

    /// Its leaf's raw Ed25519 signature key, which the credential's leaf binding must sign.
    pub fn signature_public_key(&self) -> Vec<u8> {
        self.0.leaf_node().signature_key().as_slice().to_vec()
    }
}

#[cfg(test)]
mod tests;
