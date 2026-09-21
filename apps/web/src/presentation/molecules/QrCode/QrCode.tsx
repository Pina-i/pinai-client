import { QRCodeSVG } from "qrcode.react"
import { cn } from "@/presentation/_libs/utils"

export interface QrCodeProps {
    /** The text the QR encodes — for TOTP this is an `otpauth://totp/...` URL. */
    value: string
    /** Pixel size of the rendered SVG. Defaults to 196. */
    size?: number
    className?: string
}

/**
 * Inline SVG QR rendered client-side from a value string. No network round-trip,
 * no canvas — fast, theme-friendly, accessible (announced as an image).
 *
 * High error-correction (`level="M"`) leaves room for the centre logo space
 * typical authenticator apps overlay during scan.
 */
export function QrCode({ value, size = 196, className }: QrCodeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center justify-center rounded-[var(--radius)] bg-background p-3",
                "border border-border",
                className,
            )}
            role="img"
            aria-label="Authenticator QR code"
        >
            <QRCodeSVG
                value={value}
                size={size}
                level="M"
                marginSize={0}
                bgColor="transparent"
                fgColor="currentColor"
            />
        </div>
    )
}
