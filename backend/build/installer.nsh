!macro customInstall
  Rename "$INSTDIR\${UNINSTALL_FILENAME}" "$INSTDIR\.seenary-uninstall-core.exe"
  File /oname=SeenaryUninstaller.exe "${BUILD_RESOURCES_DIR}\SeenaryUninstaller.exe"
  Rename "$INSTDIR\SeenaryUninstaller.exe" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend
