import type { DeviceClient, DeviceKind } from "@pinai/domain/models/device"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { Globe, History, Laptop, Smartphone, Tablet } from "lucide-react-native"
import { Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { CodeCells } from "@/presentation/molecules/code-cells/code-cells"
import { Group, GroupHeader, GroupRow } from "@/presentation/molecules/group/group"
import { useDeviceWayViewModel } from "./device-way.viewmodel"

export interface DeviceWayProps {
    /** The way on screen: off it, a request nobody answered ends. */
    active: boolean
    deviceReady: boolean
    share: AwaitedShareState | null
    onApproved: () => void
    onIn: () => void
    /** Where to type the code: any device signed in, or the one that reset the history. */
    instruction?: string
}

function deviceIcon(kind: DeviceKind, client: DeviceClient) {
    if (client === "browser") return Globe
    if (kind === "phone") return Smartphone
    if (kind === "tablet") return Tablet
    return Laptop
}

/** "Device": the code to type on a device already signed in, and those it can be typed on. */
export function DeviceWay(props: DeviceWayProps) {
    const vm = useDeviceWayViewModel(props)
    const { theme } = useUnistyles()

    return (
        <View accessibilityLabel="Approve from another device">
            <Group>
                <View style={styles.card}>
                    <View style={styles.head}>
                        <Text style={styles.label}>Approval code</Text>
                        {vm.nextCode && <Text style={styles.next}>{vm.nextCode}</Text>}
                    </View>
                    <View style={styles.cells}>
                        <CodeCells halves={vm.halves} />
                    </View>
                    <Text style={styles.instruction}>
                        {props.instruction ?? "On a phone or laptop where you're signed in, open Pīna'i and type this code."}
                    </Text>
                    {vm.line && (
                        <Text
                            accessibilityLiveRegion="polite"
                            style={styles.line}
                        >
                            {vm.line}
                        </Text>
                    )}
                    {vm.action && (
                        <Button
                            label={vm.action}
                            variant="quiet"
                            onPress={vm.onAction}
                        />
                    )}
                </View>
            </Group>
            {vm.approvers.length > 0 && (
                <>
                    <GroupHeader>You can approve from</GroupHeader>
                    <Group>
                        {vm.approvers.map((device) => {
                            const Icon = deviceIcon(device.kind, device.client)
                            return (
                                <GroupRow key={device.deviceId}>
                                    <Icon
                                        size={18}
                                        color={theme.colors.mutedForeground}
                                        strokeWidth={1.9}
                                    />
                                    <Text style={styles.device}>{device.label}</Text>
                                </GroupRow>
                            )
                        })}
                    </Group>
                </>
            )}
            <View style={styles.footer}>
                <History
                    size={14}
                    color={theme.colors.mutedForeground}
                    strokeWidth={1.9}
                />
                <Text style={styles.footerText}>Then your conversations and history arrive here.</Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    card: {
        paddingTop: 18,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    head: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    label: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    next: {
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
    cells: { marginTop: 14 },
    instruction: {
        marginTop: 14,
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.mutedForeground,
    },
    line: {
        marginTop: 12,
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.foreground,
    },
    device: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 15,
        color: theme.colors.foreground,
    },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        marginHorizontal: 16,
    },
    footerText: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
}))
