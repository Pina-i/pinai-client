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
    let mut reader = Reader { bytes, at: 0 };
    let count = reader.length()?;
    let mut values = HashMap::new();
    for _ in 0..count {
        let (key_len, value_len) = (reader.length()?, reader.length()?);
        let key = reader.take(key_len)?.to_vec();
        let value = reader.take(value_len)?.to_vec();
        values.insert(key, value);
    }
    Ok(values)
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, len: usize) -> Result<&'a [u8], MlsError> {
        let end = self
            .at
            .checked_add(len)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| MlsError::malformed("Storage snapshot", "it ends before what it announces"))?;
        let taken = &self.bytes[self.at..end];
        self.at = end;
        Ok(taken)
    }

    /// A u64 length, refused past what this platform can address: wasm32's `usize` is 32 bits.
    fn length(&mut self) -> Result<usize, MlsError> {
        let raw = u64::from_be_bytes(self.take(8)?.try_into().expect("eight bytes taken"));
        usize::try_from(raw).map_err(|_| MlsError::malformed("Storage snapshot", "a length past this platform's memory"))
    }
}
#[cfg(test)]
mod tests;
