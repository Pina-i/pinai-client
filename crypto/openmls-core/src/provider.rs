use std::collections::HashMap;

use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::OpenMlsProvider;

use crate::MlsError;

/// Crypto + storage backend handle. Construct once per session; pass the
/// same instance to every `Group` operation.
#[derive(Default)]
pub struct Provider(pub(crate) OpenMlsRustCrypto);

impl Provider {
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
    pub fn serialize_storage(&self) -> Result<Vec<u8>, MlsError> {
        let values = self
            .0
            .storage()
            .values
            .read()
            .map_err(|_| MlsError::State("The provider's storage lock is poisoned"))?;

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
    pub fn deserialize_storage(&self, bytes: &[u8]) -> Result<(), MlsError> {
        let snapshot = decode_snapshot(bytes)?;
        let mut values = self
            .0
            .storage()
            .values
            .write()
            .map_err(|_| MlsError::State("The provider's storage lock is poisoned"))?;
        *values = snapshot;
        Ok(())
    }
}

fn decode_snapshot(bytes: &[u8]) -> Result<HashMap<Vec<u8>, Vec<u8>>, MlsError> {
    let truncated = |detail: &'static str| MlsError::malformed("Storage snapshot", detail);
    let mut new_map = HashMap::new();
    let mut cursor = 0usize;
    if bytes.len() < 8 {
        return Err(truncated("shorter than its header"));
    }
    let count = u64::from_be_bytes(
        bytes[cursor..cursor + 8]
            .try_into()
            .map_err(|_| truncated("its count can't be read"))?,
    ) as usize;
    cursor += 8;

    for _ in 0..count {
        if cursor + 16 > bytes.len() {
            return Err(truncated("an entry's lengths read past its end"));
        }
        let k_len = u64::from_be_bytes(bytes[cursor..cursor + 8].try_into().unwrap()) as usize;
        let v_len = u64::from_be_bytes(bytes[cursor + 8..cursor + 16].try_into().unwrap()) as usize;
        cursor += 16;
        if cursor + k_len + v_len > bytes.len() {
            return Err(truncated("an entry's data reads past its end"));
        }
        let k = bytes[cursor..cursor + k_len].to_vec();
        cursor += k_len;
        let v = bytes[cursor..cursor + v_len].to_vec();
        cursor += v_len;
        new_map.insert(k, v);
    }
    Ok(new_map)
}

#[cfg(test)]
mod tests;
