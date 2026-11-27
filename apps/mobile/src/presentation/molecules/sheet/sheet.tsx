import type { ReactNode } from "react"
import { Modal, Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"

interface SheetProps {
    visible: boolean
    /** What a screen reader calls it. */
    label: string
    /** The scrim, the back gesture: `undefined` while it mustn't close (something is under way). */
    onClose?: () => void
    children: ReactNode
}

/** A sheet from the bottom over the screen, with its grabber: a question to answer, or a step of its own. */
export function Sheet({ visible, label, onClose, children }: SheetProps) {
    const insets = useSafeAreaInsets()
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={() => onClose?.()}
        >
            <View style={styles.root}>
                <Pressable
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                    importantForAccessibility={onClose ? "auto" : "no-hide-descendants"}
                    disabled={!onClose}
                    onPress={onClose}
                    style={styles.scrim}
                />
                <View
                    accessibilityViewIsModal
                    accessibilityLabel={label}
                    style={styles.sheet(insets.bottom)}
                >
                    <View
                        importantForAccessibility="no-hide-descendants"
                        style={styles.grabber}
                    />
                    {children}
                </View>
            </View>
        </Modal>
    )
}

const styles = StyleSheet.create((theme) => ({
    root: { flex: 1, justifyContent: "flex-end" },
    scrim: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: (bottom: number) => ({
        maxHeight: "86%",
        paddingTop: 6,
        paddingHorizontal: 20,
        paddingBottom: Math.max(bottom, 16) + 18,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.popover,
    }),
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 4,
        marginTop: 4,
        marginBottom: 14,
        borderRadius: 2,
        backgroundColor: theme.colors.borderStrong,
    },
}))
