// What each system answered on real machines, serial numbers and ids replaced.

const crlf = (text: string) => text.replace(/\n/g, "\r\n")

export const WINDOWS_LENOVO = crlf(`
HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS
    BiosMajorRelease    REG_DWORD    0x1
    BiosMinorRelease    REG_DWORD    0x3e
    ECFirmwareMajorRelease    REG_DWORD    0x1
    ECFirmwareMinorRelease    REG_DWORD    0x14
    BaseBoardManufacturer    REG_SZ    LENOVO
    BaseBoardProduct    REG_SZ    20XWCTO1WW
    BaseBoardVersion    REG_SZ    SDK0J40697 WIN
    BIOSReleaseDate    REG_SZ    07/04/2023
    BIOSVendor    REG_SZ    LENOVO
    BIOSVersion    REG_SZ    N32ET86W (1.62 )
    SystemFamily    REG_SZ    ThinkPad X1 Carbon Gen 9
    SystemManufacturer    REG_SZ    LENOVO
    SystemProductName    REG_SZ    20XWCTO1WW
    SystemSKU    REG_SZ    LENOVO_MT_20XW_BU_Think_FM_ThinkPad X1 Carbon Gen 9
    SystemVersion    REG_SZ    ThinkPad X1 Carbon Gen 9

`)

export const WINDOWS_HP = crlf(`
HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS
    BiosMajorRelease    REG_DWORD    0x1
    BiosMinorRelease    REG_DWORD    0xd
    BaseBoardManufacturer    REG_SZ    HP
    BaseBoardProduct    REG_SZ    880D
    BaseBoardVersion    REG_SZ    KBC Version 30.3A.00
    BIOSReleaseDate    REG_SZ    09/26/2023
    BIOSVendor    REG_SZ    HP
    BIOSVersion    REG_SZ    T37 Ver. 01.13.00
    SystemFamily    REG_SZ    103C_5336AN HP EliteBook
    SystemManufacturer    REG_SZ    HP
    SystemProductName    REG_SZ    HP EliteBook 840 G8 Notebook PC
    SystemSKU    REG_SZ    3G2Q3EA#ABF
    SystemVersion    REG_SZ    SBKPF

`)

/** A self-built PC: the motherboard's firmware fills nothing in. */
export const WINDOWS_WHITEBOX = crlf(`
HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS
    BaseBoardManufacturer    REG_SZ    ASUSTeK COMPUTER INC.
    BaseBoardProduct    REG_SZ    PRIME B450M-A
    BaseBoardVersion    REG_SZ    Rev X.0x
    BIOSVendor    REG_SZ    American Megatrends Inc.
    SystemFamily    REG_SZ    To be filled by O.E.M.
    SystemManufacturer    REG_SZ    System manufacturer
    SystemProductName    REG_SZ    System Product Name
    SystemSKU    REG_SZ    SKU
    SystemVersion    REG_SZ    System Version

`)

export const WINDOWS_HYPER_V = crlf(`
HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS
    BaseBoardManufacturer    REG_SZ    Microsoft Corporation
    BaseBoardProduct    REG_SZ    Virtual Machine
    BIOSVendor    REG_SZ    Microsoft Corporation
    SystemFamily    REG_SZ    Virtual Machine
    SystemManufacturer    REG_SZ    Microsoft Corporation
    SystemProductName    REG_SZ    Virtual Machine
    SystemSKU    REG_SZ    None
    SystemVersion    REG_SZ    Hyper-V UEFI Release v4.1

`)

/** `/sys/class/dmi/id/{sys_vendor,product_name,product_version,product_family}`, as read. */
export const LINUX_LENOVO = {
    vendor: "LENOVO\n",
    productName: "20XWCTO1WW\n",
    productVersion: "ThinkPad X1 Carbon Gen 9\n",
    family: "ThinkPad X1 Carbon Gen 9\n",
}

export const LINUX_DELL = {
    vendor: "Dell Inc.\n",
    productName: "XPS 13 9310\n",
    productVersion: "\n",
    family: "XPS\n",
}

export const LINUX_WHITEBOX = {
    vendor: "To Be Filled By O.E.M.\n",
    productName: "To Be Filled By O.E.M.\n",
    productVersion: "To Be Filled By O.E.M.\n",
    family: "To Be Filled By O.E.M.\n",
}

/** A QEMU guest, which has no `product_family`. */
export const LINUX_QEMU = {
    vendor: "QEMU\n",
    productName: "Standard PC (Q35 + ICH9, 2009)\n",
    productVersion: "pc-q35-8.2\n",
    family: null,
}

export const FEDORA_OS_RELEASE = `NAME="Fedora Linux"
VERSION="44 (Workstation Edition)"
RELEASE_TYPE=stable
ID=fedora
VERSION_ID=44
PRETTY_NAME="Fedora Linux 44 (Workstation Edition)"
VARIANT_ID=workstation
`

export const UBUNTU_OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
UBUNTU_CODENAME=noble
`

export const MAC_HARDWARE = `{
  "SPHardwareDataType" : [
    {
      "_name" : "hardware_overview",
      "activation_lock_status" : "activation_lock_disabled",
      "boot_rom_version" : "10151.81.1",
      "chip_type" : "Apple M2",
      "machine_model" : "Mac14,2",
      "machine_name" : "MacBook Air",
      "model_number" : "Z15S000CXB/A",
      "number_processors" : "proc 8:4:4",
      "os_loader_version" : "10151.81.1",
      "physical_memory" : "16 GB",
      "platform_UUID" : "00000000-0000-0000-0000-000000000000",
      "provisioning_UDID" : "00000000-0000000000000000",
      "serial_number" : "XXXXXXXXXX"
    }
  ]
}
`

/** An Intel Mac's answer, which names the same machine the same way. */
export const MAC_INTEL_HARDWARE = `{
  "SPHardwareDataType" : [
    {
      "_name" : "hardware_overview",
      "boot_rom_version" : "2022.100.22.0.0 (iBridge: 21.16.4222.0.0,0)",
      "cpu_type" : "8-Core Intel Core i9",
      "current_processor_speed" : "2,3 GHz",
      "l2_cache_core" : "256 KB",
      "l3_cache" : "16 MB",
      "machine_model" : "MacBookPro16,1",
      "machine_name" : "MacBook Pro",
      "number_processors" : 8,
      "packages" : 1,
      "physical_memory" : "32 GB",
      "platform_UUID" : "00000000-0000-0000-0000-000000000000",
      "serial_number" : "XXXXXXXXXXXX"
    }
  ]
}
`

/** `/sys/firmware/devicetree/base/model` on a Raspberry Pi, which has no DMI: NUL-terminated. */
export const RASPBERRY_PI_MODEL = "Raspberry Pi 5 Model B Rev 1.0\0"

