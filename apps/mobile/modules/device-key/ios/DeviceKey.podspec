Pod::Spec.new do |s|
  s.name             = 'DeviceKey'
  s.version          = '0.1.0'
  s.summary          = "Pīna'i's device key on iOS: AES-256-GCM under a key kept in the Keychain"
  s.homepage         = 'https://github.com/Pina-i/pinai-client'
  s.license          = 'AGPL-3.0-or-later'
  s.author           = 'Pina-i'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: 'https://github.com/Pina-i/pinai-client.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files        = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
