const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.resolve(__dirname, '..');
const buildDir = path.join(backendDir, 'build');
const outputPath = path.join(buildDir, 'SeenaryUninstaller.exe');
const compilerCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];
const compiler = compilerCandidates.find((candidate) => fs.existsSync(candidate));
const frameworkAssemblies = {
  PresentationCore:
    'C:\\Windows\\Microsoft.NET\\assembly\\GAC_32\\PresentationCore\\v4.0_4.0.0.0__31bf3856ad364e35\\PresentationCore.dll',
  PresentationFramework:
    'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\PresentationFramework\\v4.0_4.0.0.0__31bf3856ad364e35\\PresentationFramework.dll',
  WindowsBase:
    'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\WindowsBase\\v4.0_4.0.0.0__31bf3856ad364e35\\WindowsBase.dll',
  SystemXaml:
    'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\System.Xaml\\v4.0_4.0.0.0__b77a5c561934e089\\System.Xaml.dll',
};

if (process.platform !== 'win32') {
  console.error('The custom Seenary uninstaller currently requires Windows.');
  process.exit(1);
}

if (!compiler) {
  console.error('The Windows .NET Framework C# compiler was not found.');
  process.exit(1);
}

const args = [
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  `/out:${outputPath}`,
  `/win32icon:${path.join(buildDir, 'icon.ico')}`,
  `/reference:${frameworkAssemblies.PresentationCore}`,
  `/reference:${frameworkAssemblies.PresentationFramework}`,
  `/reference:${frameworkAssemblies.WindowsBase}`,
  `/reference:${frameworkAssemblies.SystemXaml}`,
  `/resource:${path.join(buildDir, 'installer-art-source.png')},Seenary.InstallerArt`,
  `/resource:${path.join(buildDir, 'icon.png')},Seenary.AppIcon`,
  path.join(backendDir, 'installer', 'SeenaryUninstaller.cs'),
];

const result = spawnSync(compiler, args, {
  cwd: backendDir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
if (result.status !== 0) {
  fs.rmSync(outputPath, { force: true });
  process.exit(result.status || 1);
}

console.log(`Built custom Seenary uninstaller: ${outputPath}`);
