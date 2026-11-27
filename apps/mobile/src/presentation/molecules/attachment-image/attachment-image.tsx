import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { imagePreviewOf } from "@pinai/domain/models/image-preview"
import { Image } from "expo-image"
import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { useAttachmentImage } from "@/presentation/hooks/use-attachment-image"

const MAX_WIDTH = 280
const MAX_HEIGHT = 320
// An image sent without its size gets a fixed frame, so its arrival moves nothing.
const FRAME = { width: 240, height: 180 }

interface AttachmentImageProps {
    attachmentKey: AttachmentBlobKey
}

/**
 * An image a message carried, decrypted on the phone: laid out at the size its key gives before it loads, its blurhash
 * meanwhile. Never cached on disk: it is plaintext.
 */
export function AttachmentImage({ attachmentKey }: AttachmentImageProps) {
    const { uri, failed } = useAttachmentImage(attachmentKey)
    const preview = imagePreviewOf(attachmentKey)
    const box = preview ?? FRAME
    const width = Math.min(box.width, MAX_WIDTH, (MAX_HEIGHT * box.width) / box.height)

    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={failed ? `${attachmentKey.original_filename}, couldn't be loaded` : attachmentKey.original_filename}
            style={[styles.frame, { width, aspectRatio: box.width / box.height }]}
        >
            {preview?.blurhash && (
                <Image
                    source={{ blurhash: preview.blurhash, width: 16, height: 16 }}
                    cachePolicy="memory"
                    style={styles.fill}
                />
            )}
            {uri && (
                <Image
                    source={{ uri, cacheKey: attachmentKey.id }}
                    cachePolicy="memory"
                    contentFit={preview ? "cover" : "contain"}
                    transition={200}
                    style={styles.fill}
                />
            )}
            {failed && <Text style={styles.failed}>This image couldn't be loaded</Text>}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    frame: {
        maxWidth: "100%",
        marginTop: 8,
        overflow: "hidden",
        justifyContent: "center",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    },
    fill: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    failed: {
        paddingHorizontal: 12,
        textAlign: "center",
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        color: theme.colors.mutedForeground,
    },
}))
