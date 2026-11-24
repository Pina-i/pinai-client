import { Text } from "react-native"

export interface WordsWayProps {
    active: boolean
    setUp: () => Promise<void> | null
    onTyping: (busy: boolean) => void
    onIn: () => void
}

export function WordsWay(_: WordsWayProps) {
    return <Text>Type your 24 words</Text>
}
