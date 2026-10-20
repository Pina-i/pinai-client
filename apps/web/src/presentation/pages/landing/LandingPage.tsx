import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { ClientDownload } from "./client-download/client-download"
import { HandoffScreen } from "./handoff-screen/handoff-screen"
import { HomePicker } from "./home-picker/home-picker"
import { useLandingPageViewModel } from "./LandingPage.viewmodel"

export function LandingPage() {
    const vm = useLandingPageViewModel()

    if (vm.handoff) {
        return <HandoffScreen name={vm.handoff.name} endpoint={vm.handoff.endpoint} onBarDone={vm.barDone} />
    }

    return (
        <AuthShell panelClassName="max-w-[400px]" asideFooter={<ClientDownload />}>
            <HomePicker
                address={vm.input}
                onAddressChange={vm.changeAddress}
                resolution={vm.resolution}
                resolvedHost={vm.resolvedHost}
                recent={vm.recent}
                onPickRecent={vm.pickRecent}
                onContinue={() => void vm.continueToInstance()}
            />
        </AuthShell>
    )
}
