import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

export function useReduceMotion(): boolean {
    const [reduce, setReduce] = useState(false)
    useEffect(() => {
        let live = true
        void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on))
        const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce)
        return () => {
            live = false
            subscription.remove()
        }
    }, [])
    return reduce
}
