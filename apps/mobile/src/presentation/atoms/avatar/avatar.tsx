import { type AvatarTone, avatarToneFor } from "@pinai/domain/models/avatar-tone"
import type { UserStatus } from "@pinai/domain/models/presence"
import { Image } from "expo-image"
import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { statusColor } from "@/theme/status"
import { avatarTones } from "@/theme/themes.generated"

const SIZES = {
    sm: { box: 34, font: 12.5, dot: 11 },
    lg: { box: 56, font: 20, dot: 13 },
} as const

interface AvatarProps {
    /** The name people read: its first two letters stand in for a missing image. */
    name: string
    /** The person's address, for their tone — the same on every client. */
    seed: string
    imageUrl?: string | null
    size?: keyof typeof SIZES
    status?: UserStatus
}

export function Avatar({ name, seed, imageUrl, size = "sm", status }: AvatarProps) {
    const tone = avatarToneFor(seed)
    return (
        <View
            importantForAccessibility="no-hide-descendants"
            style={styles.box(size)}
        >
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    contentFit="cover"
                    style={styles.image(size)}
                />
            ) : (
                <View style={styles.face(size, tone)}>
                    <Text style={styles.initials(size, tone)}>{Array.from(name).slice(0, 2).join("").toUpperCase()}</Text>
                </View>
            )}
            {status && <View style={styles.dot(size, status)} />}
        </View>
    )
}

const styles = StyleSheet.create((theme) => {
    const tones: Record<AvatarTone, { fill: string; ink: string }> = {
        acc: { fill: theme.colors.chat, ink: theme.colors.chatForeground },
        sec: { fill: theme.colors.voice, ink: theme.colors.voiceForeground },
        neutral: { fill: theme.colors.surface3, ink: theme.colors.foreground },
        ...avatarTones,
    }
    return {
        box: (size: keyof typeof SIZES) => ({
            width: SIZES[size].box,
            height: SIZES[size].box,
        }),
        image: (size: keyof typeof SIZES) => ({
            width: SIZES[size].box,
            height: SIZES[size].box,
            borderRadius: SIZES[size].box / 2,
        }),
        face: (size: keyof typeof SIZES, tone: AvatarTone) => ({
            width: SIZES[size].box,
            height: SIZES[size].box,
            borderRadius: SIZES[size].box / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tones[tone].fill,
        }),
        initials: (size: keyof typeof SIZES, tone: AvatarTone) => ({
            fontFamily: "Instrument Serif",
            fontSize: SIZES[size].font,
            fontWeight: "600",
            color: tones[tone].ink,
        }),
        dot: (size: keyof typeof SIZES, status: UserStatus) => ({
            position: "absolute",
            right: -1,
            bottom: -1,
            width: SIZES[size].dot,
            height: SIZES[size].dot,
            borderRadius: SIZES[size].dot / 2,
            borderWidth: 2,
            borderColor: theme.colors.background,
            backgroundColor: statusColor(theme, status),
        }),
    }
})
