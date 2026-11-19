import { useEffect, useState } from "react"

import { getThisDeviceLabel } from "@/ioc"

/** This device's name as it names itself: the `User-Agent`'s at once, refined once the platform's hints arrive. */
export function useThisDeviceName(): string {
    const [name, setName] = useState(() => getThisDeviceLabel().now().name)
    useEffect(() => {
        let live = true
        void getThisDeviceLabel()
            .settled()
            .then((label) => {
                if (live) setName(label.name)
            })
        return () => {
            live = false
        }
    }, [])
    return name
}
