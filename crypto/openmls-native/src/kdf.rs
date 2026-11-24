//! Argon2id for the E2EE core's history key and approval code: natively, as JavaScript on the phone's
//! engine would take tens of seconds. Byte for byte what `@pinai/crypto/contract/argon2` lists.

use argon2::{Algorithm, Argon2, Params, Version};

use crate::MlsFailure;

/// `passes`, `memory_kib`, `lanes` as RFC 9106 names them; `length` bytes out.
#[uniffi::export]
pub fn argon2id(
    password: Vec<u8>,
    salt: Vec<u8>,
    passes: u32,
    memory_kib: u32,
    lanes: u32,
    length: u32,
) -> Result<Vec<u8>, MlsFailure> {
    let params = Params::new(memory_kib, passes, lanes, Some(length as usize))
        .map_err(|e| MlsFailure::Malformed(format!("argon2id settings: {e}")))?;
    let mut out = vec![0u8; length as usize];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(&password, &salt, &mut out)
        .map_err(|e| MlsFailure::Malformed(format!("argon2id: {e}")))?;
    Ok(out)
}
