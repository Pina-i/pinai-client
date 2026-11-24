import { Check, ChevronRight, Globe, Search } from "lucide-react-native"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { InitialTile } from "@/presentation/atoms/initial-tile/initial-tile"
import { Group, GroupFooter, GroupHeader, GroupRow } from "@/presentation/molecules/group/group"
import { tint } from "@/theme/tint"
import { useServerViewModel } from "./server.viewmodel"

/** "Your server": the address typed, or one this phone signed in to before. */
export function ServerSheet() {
    const vm = useServerViewModel()
    const { theme } = useUnistyles()

    return (
        <View style={styles.sheet}>
            <View
                importantForAccessibility="no-hide-descendants"
                style={styles.grabber}
            />
            <View style={styles.head}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Your server
                </Text>
                <Pressable
                    accessibilityRole="button"
                    onPress={vm.cancel}
                    style={styles.cancel}
                >
                    <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
            </View>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.body}
            >
                <Group>
                    <GroupRow minHeight={50}>
                        <Search
                            size={17}
                            color={theme.colors.mutedForeground}
                            strokeWidth={1.9}
                        />
                        <TextInput
                            accessibilityLabel="Server address"
                            placeholder="Search or type an address"
                            placeholderTextColor={theme.colors.mutedForeground}
                            value={vm.input}
                            onChangeText={vm.setInput}
                            onSubmitEditing={vm.openTyped}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                            keyboardType="url"
                            returnKeyType="go"
                            style={styles.field}
                        />
                    </GroupRow>
                </Group>

                {vm.goTo && (
                    <>
                        <GroupHeader>Go to</GroupHeader>
                        <Group>
                            <GroupRow
                                minHeight={60}
                                disabled={!vm.goTo.ready}
                                onPress={vm.openTyped}
                                accessibilityLabel={`${vm.goTo.host}, ${vm.goTo.meta}`}
                            >
                                <InitialTile>
                                    <Globe
                                        size={18}
                                        color={theme.colors.foreground}
                                        strokeWidth={1.9}
                                    />
                                </InitialTile>
                                <View style={styles.rowText}>
                                    <Text style={styles.typedHost}>{vm.goTo.host}</Text>
                                    <Text style={styles.meta}>{vm.goTo.meta}</Text>
                                </View>
                                {vm.goTo.ready && (
                                    <ChevronRight
                                        size={18}
                                        color={theme.colors.mutedForeground}
                                        strokeWidth={1.9}
                                    />
                                )}
                            </GroupRow>
                        </Group>
                    </>
                )}

                {vm.list.rows.length > 0 && (
                    <>
                        <GroupHeader>{vm.list.title}</GroupHeader>
                        <Group>
                            {vm.list.rows.map((row) => (
                                <GroupRow
                                    key={row.address.origin}
                                    minHeight={0}
                                    onPress={() => vm.pick(row.address, row.info)}
                                    accessibilityLabel={row.label}
                                    style={[styles.instance, row.found && styles.found]}
                                >
                                    {row.found && <View style={styles.foundEdge} />}
                                    <InitialTile accent={row.found ? theme.colors.online : undefined}>{row.initial}</InitialTile>
                                    <View style={styles.instanceText}>
                                        <View style={styles.nameLine}>
                                            <Text style={styles.name}>{row.name}</Text>
                                            {row.found && (
                                                <Check
                                                    size={15}
                                                    color={theme.colors.online}
                                                    strokeWidth={2.4}
                                                />
                                            )}
                                        </View>
                                        {row.description && (
                                            <Text
                                                numberOfLines={2}
                                                style={styles.description}
                                            >
                                                {row.description}
                                            </Text>
                                        )}
                                        <Text style={styles.facts}>
                                            {row.address.host} ·{" "}
                                            <Text style={row.found && row.info ? styles.foundRegistration(row.info.openRegistrations) : undefined}>{row.registration}</Text>
                                        </Text>
                                    </View>
                                    <View style={styles.chevron}>
                                        <ChevronRight
                                            size={18}
                                            color={theme.colors.mutedForeground}
                                            strokeWidth={1.9}
                                        />
                                    </View>
                                </GroupRow>
                            ))}
                        </Group>
                    </>
                )}

                <GroupFooter>Don&apos;t know your server? It&apos;s the part after @ in your address, or the site where you signed up.</GroupFooter>
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    sheet: {
        flex: 1,
        backgroundColor: theme.colors.popover,
    },
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 4,
        borderRadius: 2,
        marginTop: 10,
        marginBottom: 6,
        backgroundColor: theme.colors.borderStrong,
    },
    head: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 20,
        paddingRight: 12,
    },
    title: {
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "700",
        color: theme.colors.foreground,
    },
    cancel: {
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    cancelLabel: {
        fontFamily: "DM Sans",
        fontSize: 15,
        color: theme.colors.chat,
    },
    body: {
        paddingTop: 6,
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    field: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 12,
        fontFamily: "DM Sans",
        fontSize: 16,
        color: theme.colors.foreground,
    },
    rowText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    typedHost: {
        fontFamily: "Azeret Mono",
        fontSize: 16,
        fontWeight: "500",
        color: theme.colors.foreground,
    },
    instance: {
        alignItems: "flex-start",
        paddingVertical: 14,
    },
    found: {
        backgroundColor: tint(theme.colors.online, 0.09),
    },
    foundEdge: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 3,
        backgroundColor: theme.colors.online,
    },
    instanceText: {
        flex: 1,
        minWidth: 0,
        gap: 3,
    },
    nameLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    name: {
        fontFamily: "DM Sans",
        fontSize: 16,
        fontWeight: "700",
        color: theme.colors.foreground,
    },
    description: {
        fontFamily: "DM Sans",
        fontSize: 13.5,
        lineHeight: 19,
        color: theme.colors.mutedForeground,
    },
    facts: {
        marginTop: 2,
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.21,
        color: theme.colors.mutedForeground,
        opacity: 0.8,
    },
    foundRegistration: (open: boolean) => ({
        fontWeight: "500",
        color: open ? theme.colors.online : theme.colors.idle,
    }),
    chevron: {
        alignSelf: "center",
    },
    meta: {
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
