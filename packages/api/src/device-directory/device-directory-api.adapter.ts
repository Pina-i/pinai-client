import { HTTPError } from "ky"
import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

import { bytesToBase64, decodeBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceApproval, DeviceKind, DeviceListEntry, DeviceListResponse } from "@pinai/domain/models/device"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"

/** REST client for the device-directory endpoints. */
export class DeviceDirectoryApiAdapter implements IDeviceDirectoryPort {
    async listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/keys/devices`
        try {
            const body = await idp
                .get(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<unknown>()
            return parseDeviceList(body)
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = (await error.response.json().catch(() => ({}))) as { error?: string }
                throw new Error(
                    err.error ?? `Failed to fetch devices: ${error.response.status}`,
                )
            }
            throw error
        }
    }

    async markRevoked(
        idpUrl: string,
        accessToken: string,
        deviceId: string,
    ): Promise<void> {
        try {
            await idp.post(`${deviceUrl(idpUrl, deviceId)}/revoke`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to revoke device")
        }
    }

    async approveByPassphrase(
        idpUrl: string,
        accessToken: string,
        deviceId: string,
        generation: number,
        signature: Uint8Array,
    ): Promise<void> {
        try {
            await idp.post(`${deviceUrl(idpUrl, deviceId)}/approvals`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { by: "passphrase", generation, signature: bytesToBase64(signature) },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Approving this device failed")
        }
    }

    async reportHistoryKey(idpUrl: string, accessToken: string, deviceId: string, generation: number): Promise<void> {
        try {
            await idp.put(`${deviceUrl(idpUrl, deviceId)}/history-key`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { generation },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Reporting the history key failed")
        }
    }
}

function deviceUrl(idpUrl: string, deviceId: string): string {
    return `${idpUrl.replace(/\/$/, "")}/api/keys/devices/${encodeURIComponent(deviceId)}`
}

type Row = Record<string, unknown>

/** A key that isn't base64 reads as none: the chain it belonged to then fails to verify. */
export function parseDeviceList(body: unknown): DeviceListResponse {
    const devices = isRow(body) && Array.isArray(body.devices) ? body.devices.filter(isRow) : []
    return { devices: devices.map(parseDevice) }
}

function parseDevice(row: Row): DeviceListEntry {
    return {
        device_id: String(row.device_id),
        display_name: typeof row.display_name === "string" ? row.display_name : "",
        kind: (typeof row.kind === "string" ? row.kind : "unknown") as DeviceKind,
        paired_at: String(row.paired_at),
        last_seen_at: String(row.last_seen_at),
        revoked_at: text(row.revoked_at),
        signed_in: row.signed_in === true,
        last_active_at: text(row.last_active_at),
        drk_public_key: decodeBase64(row.drk_public_key),
        attestation_signature: decodeBase64(row.attestation_signature),
        attestation_kid: text(row.attestation_kid),
        attestation_expires_at: text(row.attestation_expires_at),
        hpke_public_key: decodeBase64(row.hpke_public_key),
        hpke_key_signature: decodeBase64(row.hpke_key_signature),
        history_generation: typeof row.history_generation === "number" ? row.history_generation : null,
        approvals: Array.isArray(row.approvals)
            ? row.approvals.filter(isRow).flatMap((approval) => parseApproval(approval) ?? [])
            : [],
    }
}

function parseApproval(row: Row): DeviceApproval | null {
    const signature = decodeBase64(row.signature)
    const createdAt = text(row.created_at)
    if (!signature || !createdAt) return null
    if (row.by === "device" && typeof row.device_id === "string") {
        return { by: "device", device_id: row.device_id, signature, created_at: createdAt }
    }
    if (row.by === "passphrase" && typeof row.generation === "number") {
        return { by: "passphrase", generation: row.generation, signature, created_at: createdAt }
    }
    return null
}

function isRow(value: unknown): value is Row {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
    return typeof value === "string" ? value : null
}
