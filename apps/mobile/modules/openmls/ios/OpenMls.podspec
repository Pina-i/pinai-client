Pod::Spec.new do |s|
  s.name             = 'OpenMls'
  s.version          = '0.1.0'
  s.summary          = "Pīna'i's MLS engine on iOS: crypto/openmls-native behind an Expo module"
  s.homepage         = 'https://github.com/Pina-i/pinai-client'
  s.license          = 'AGPL-3.0-or-later'
  s.author           = 'Pina-i'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: 'https://github.com/Pina-i/pinai-client.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # scripts/build-native-mls.mjs ios: the static libraries with their C header as an xcframework, and the Swift
  # uniffi generated for them, compiled into this module.
  s.source_files        = '*.swift', 'generated/swift/*.swift'
  s.vendored_frameworks = 'generated/OpenMlsNative.xcframework'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
