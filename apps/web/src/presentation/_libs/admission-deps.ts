import type { CheckAdmissionDeps } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"

/** What deciding whether this device is in reads: the screens' one wiring of it. */
export function admissionDeps(): CheckAdmissionDeps {
    return { e2eePort: getE2eePort(), deviceDirectoryPort: getDeviceDirectoryPort(), report: warnE2ee }
}
