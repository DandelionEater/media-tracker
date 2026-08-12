using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;

[assembly: AssemblyTitle("Uninstall Seenary")]
[assembly: AssemblyProduct("Seenary")]
[assembly: AssemblyCompany("Dainius Genzuras")]
[assembly: AssemblyDescription("Seenary desktop uninstaller")]

namespace SeenaryUninstaller
{
    internal static class Program
    {
        internal const string CoreUninstallerName = ".seenary-uninstall-core.exe";
        private const string CleanupArgument = "--seenary-uninstaller-cleanup";
        private static string renamedLauncherPath;

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                SetProcessDPIAware();

                if (TryRunCleanup(args))
                {
                    return;
                }

                if (HasSilentArgument(args))
                {
                    var exitCode = RunCoreUninstaller(args);
                    if (exitCode == 0)
                    {
                        ScheduleCleanup();
                    }
                    Environment.Exit(exitCode);
                    return;
                }

                var application = new Application
                {
                    ShutdownMode = ShutdownMode.OnMainWindowClose
                };
                application.Run(new UninstallerWindow(args));
            }
            catch (Exception error)
            {
                var logPath = Path.Combine(
                    Path.GetTempPath(),
                    "SeenaryUninstaller-error.log");
                try
                {
                    File.WriteAllText(logPath, error.ToString());
                }
                catch
                {
                    // Preserve the original error if logging is unavailable.
                }

                MessageBox.Show(
                    "The Seenary uninstaller could not open. Details were saved to "
                        + logPath,
                    "Seenary uninstaller",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }

        internal static int RunCoreUninstaller(string[] args)
        {
            var ownDirectory = Path.GetDirectoryName(
                Assembly.GetExecutingAssembly().Location);
            var corePath = Path.Combine(ownDirectory, CoreUninstallerName);
            if (!File.Exists(corePath))
            {
                return 2;
            }

            PrepareLauncherForRemoval();

            var startInfo = new ProcessStartInfo
            {
                FileName = corePath,
                Arguments = JoinArguments(args),
                UseShellExecute = true,
                WorkingDirectory = ownDirectory
            };

            using (var process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    return 3;
                }

                process.WaitForExit();
                var exitCode = process.ExitCode;
                if (exitCode != 0)
                {
                    RestoreLauncher();
                }
                return exitCode;
            }
        }

        internal static void ScheduleCleanup()
        {
            if (string.IsNullOrEmpty(renamedLauncherPath)
                || !File.Exists(renamedLauncherPath))
            {
                return;
            }

            try
            {
                var tempDirectory = Path.Combine(
                    Path.GetTempPath(),
                    "SeenaryUninstaller",
                    Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempDirectory);
                var helperPath = Path.Combine(
                    tempDirectory,
                    "SeenaryUninstallerCleanup.exe");
                File.Copy(renamedLauncherPath, helperPath);

                var arguments = new[]
                {
                    CleanupArgument,
                    Process.GetCurrentProcess().Id.ToString(),
                    renamedLauncherPath,
                    Path.GetDirectoryName(renamedLauncherPath)
                };
                Process.Start(new ProcessStartInfo
                {
                    FileName = helperPath,
                    Arguments = JoinArguments(arguments),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            }
            catch
            {
                // A uniquely named launcher is harmless if Windows blocks cleanup.
            }
        }

        private static void PrepareLauncherForRemoval()
        {
            var ownPath = Assembly.GetExecutingAssembly().Location;
            var ownDirectory = Path.GetDirectoryName(ownPath);
            var renamedPath = Path.Combine(
                ownDirectory,
                ".seenary-uninstall-ui-" + Guid.NewGuid().ToString("N") + ".exe");
            try
            {
                File.Move(ownPath, renamedPath);
                renamedLauncherPath = renamedPath;
            }
            catch
            {
                // Never clean a stable filename: an updater could already have
                // installed a new copy there by the time this process exits.
                renamedLauncherPath = null;
            }
        }

        private static void RestoreLauncher()
        {
            if (string.IsNullOrEmpty(renamedLauncherPath)
                || !File.Exists(renamedLauncherPath))
            {
                return;
            }

            try
            {
                var originalPath = Path.Combine(
                    Path.GetDirectoryName(renamedLauncherPath),
                    "Uninstall Seenary.exe");
                File.Move(renamedLauncherPath, originalPath);
                renamedLauncherPath = null;
            }
            catch
            {
                // Keep the runnable renamed copy if restoration is blocked.
            }
        }

        private static bool TryRunCleanup(string[] args)
        {
            if (args.Length != 4
                || !string.Equals(
                    args[0],
                    CleanupArgument,
                    StringComparison.Ordinal))
            {
                return false;
            }

            int parentId;
            if (int.TryParse(args[1], out parentId))
            {
                try
                {
                    using (var parent = Process.GetProcessById(parentId))
                    {
                        parent.WaitForExit(60000);
                    }
                }
                catch
                {
                    // The parent already exited.
                }
            }

            try
            {
                File.Delete(args[2]);
                if (Directory.Exists(args[3])
                    && Directory.GetFileSystemEntries(args[3]).Length == 0)
                {
                    Directory.Delete(args[3]);
                }
            }
            catch
            {
                // Leave cleanup to normal Windows maintenance if a scanner
                // briefly retains the file.
            }

            try
            {
                var helperDirectory = Path.GetDirectoryName(
                    Assembly.GetExecutingAssembly().Location);
                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/d /c ping 127.0.0.1 -n 2 > nul & rmdir /s /q "
                        + QuoteArgument(helperDirectory),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            }
            catch
            {
                // The temporary helper folder is safe for system maintenance.
            }
            return true;
        }

        private static bool HasSilentArgument(string[] args)
        {
            foreach (var argument in args)
            {
                if (string.Equals(argument, "/S", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(argument, "--updated", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static string JoinArguments(string[] args)
        {
            var quoted = new List<string>();
            foreach (var argument in args)
            {
                quoted.Add(QuoteArgument(argument));
            }
            return string.Join(" ", quoted.ToArray());
        }

        private static string QuoteArgument(string argument)
        {
            if (argument.Length > 0
                && argument.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
            {
                return argument;
            }

            var result = new StringBuilder("\"");
            var backslashCount = 0;
            foreach (var character in argument)
            {
                if (character == '\\')
                {
                    backslashCount++;
                    continue;
                }

                if (character == '"')
                {
                    result.Append('\\', (backslashCount * 2) + 1);
                    result.Append('"');
                    backslashCount = 0;
                    continue;
                }

                result.Append('\\', backslashCount);
                backslashCount = 0;
                result.Append(character);
            }
            result.Append('\\', backslashCount * 2);
            result.Append('"');
            return result.ToString();
        }
    }

    internal sealed class UninstallerWindow : Window
    {
        private static readonly Brush Surface = BrushFrom("#111116");
        private static readonly Brush SurfaceRaised = BrushFrom("#1A1921");
        private static readonly Brush Border = BrushFrom("#34313F");
        private static readonly Brush TextPrimary = BrushFrom("#F7F5FB");
        private static readonly Brush TextMuted = BrushFrom("#A7A3AE");
        private static readonly Brush Violet = BrushFrom("#9D7CFF");
        private static readonly Brush VioletDark = BrushFrom("#7251DD");
        private static readonly Brush Danger = BrushFrom("#FF7F95");

        private readonly string[] originalArguments;
        private readonly Grid contentHost;
        private readonly CheckBox keepDataCheck;
        private readonly Border dataCard;
        private bool canClose = true;
        private bool uninstallSucceeded;

        internal UninstallerWindow(string[] args)
        {
            originalArguments = args ?? new string[0];

            Title = "Uninstall Seenary";
            Width = 920;
            Height = 640;
            MinWidth = 920;
            MinHeight = 640;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            AllowsTransparency = true;
            Background = Brushes.Transparent;

            Closing += delegate(object sender, System.ComponentModel.CancelEventArgs eventArgs)
            {
                if (!canClose)
                {
                    eventArgs.Cancel = true;
                }
                else if (uninstallSucceeded)
                {
                    Program.ScheduleCleanup();
                }
            };

            var frame = new Border
            {
                Background = Surface,
                CornerRadius = new CornerRadius(24),
                BorderBrush = Border,
                BorderThickness = new Thickness(1),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 35,
                    ShadowDepth = 12,
                    Opacity = 0.48,
                    Color = Colors.Black
                },
                ClipToBounds = true
            };

            var root = new Grid();
            frame.Child = root;
            Content = frame;

            root.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs eventArgs)
            {
                if (eventArgs.ButtonState == MouseButtonState.Pressed)
                {
                    DragMove();
                }
            };

            root.Children.Add(CreateArtwork());
            root.Children.Add(new Border
            {
                Background = new LinearGradientBrush(
                    Color.FromArgb(248, 17, 17, 22),
                    Color.FromArgb(118, 17, 17, 22),
                    new Point(0.2, 0.5),
                    new Point(1, 0.5))
            });
            root.Children.Add(CreateWindowCloseButton());

            var shell = new Grid { Margin = new Thickness(67, 30, 67, 30) };
            shell.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            shell.RowDefinitions.Add(new RowDefinition());
            root.Children.Add(shell);
            shell.Children.Add(CreateTitleBar());

            contentHost = new Grid { Margin = new Thickness(0, 30, 0, 0) };
            Grid.SetRow(contentHost, 1);
            shell.Children.Add(contentHost);

            var initialView = new Grid();
            initialView.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(480) });
            initialView.ColumnDefinitions.Add(new ColumnDefinition());
            contentHost.Children.Add(initialView);

            var copy = new StackPanel
            {
                Width = 450,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 18)
            };
            initialView.Children.Add(copy);

            copy.Children.Add(new TextBlock
            {
                Text = "Leaving Seenary?",
                Foreground = TextPrimary,
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 30
            });
            copy.Children.Add(new TextBlock
            {
                Text = "You can remove the desktop app and come back whenever you like. Choose what happens to your local Seenary data first.",
                Foreground = TextMuted,
                FontSize = 15,
                LineHeight = 23,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 445,
                Margin = new Thickness(0, 14, 0, 22)
            });

            keepDataCheck = new CheckBox
            {
                Content = CreateKeepDataContent(),
                IsChecked = true,
                Foreground = TextMuted,
                VerticalContentAlignment = VerticalAlignment.Center,
                Template = CreateCheckboxTemplate(),
                Cursor = Cursors.Hand
            };
            copy.Children.Add(keepDataCheck);

            var actionRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 28, 0, 0)
            };
            copy.Children.Add(actionRow);

            var uninstallButton = CreatePrimaryButton("Uninstall Seenary");
            uninstallButton.Click += UninstallSeenary;
            actionRow.Children.Add(uninstallButton);

            var cancelButton = CreateSecondaryButton("Cancel");
            cancelButton.Height = 48;
            cancelButton.MinWidth = 96;
            cancelButton.Margin = new Thickness(12, 0, 0, 0);
            cancelButton.Click += delegate { Close(); };
            actionRow.Children.Add(cancelButton);

            dataCard = CreateDataCard();
            Grid.SetRowSpan(dataCard, 2);
            shell.Children.Add(dataCard);
        }

        private Grid CreateTitleBar()
        {
            var titleBar = new Grid { Height = 48 };

            var identity = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            titleBar.Children.Add(identity);

            var icon = CreateResourceImage("Seenary.AppIcon");
            icon.Width = 34;
            icon.Height = 34;
            icon.Margin = new Thickness(0, 0, 12, 0);
            identity.Children.Add(icon);
            identity.Children.Add(new TextBlock
            {
                Text = "Seenary",
                Foreground = TextPrimary,
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 20,
                VerticalAlignment = VerticalAlignment.Center
            });

            return titleBar;
        }

        private Button CreateWindowCloseButton()
        {
            var close = CreateTextButton("\u00D7");
            close.Width = 42;
            close.Height = 38;
            close.FontSize = 26;
            close.Foreground = TextMuted;
            close.HorizontalAlignment = HorizontalAlignment.Right;
            close.VerticalAlignment = VerticalAlignment.Top;
            close.Margin = new Thickness(0, 18, 20, 0);
            close.Click += delegate { Close(); };
            Panel.SetZIndex(close, 2);
            return close;
        }

        private static StackPanel CreateKeepDataContent()
        {
            var copy = new StackPanel { MaxWidth = 390 };
            copy.Children.Add(new TextBlock
            {
                Text = "Keep my Seenary data",
                Foreground = TextPrimary,
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 14
            });
            copy.Children.Add(new TextBlock
            {
                Text = "Recommended. Your library, settings, and sign-ins will be ready if you reinstall.",
                Foreground = TextMuted,
                FontSize = 12,
                LineHeight = 18,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 5, 0, 0)
            });
            return copy;
        }

        private static Border CreateDataCard()
        {
            var card = new Border
            {
                Width = 292,
                Height = 390,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
                Background = new LinearGradientBrush(
                    Color.FromArgb(205, 31, 28, 49),
                    Color.FromArgb(215, 18, 18, 25),
                    90),
                BorderBrush = BrushFrom("#4B416A"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(22),
                Padding = new Thickness(24)
            };

            var content = new StackPanel
            {
                VerticalAlignment = VerticalAlignment.Center
            };
            card.Child = content;
            content.Children.Add(new TextBlock
            {
                Text = "\uE8B7",
                Foreground = Violet,
                FontFamily = new FontFamily("Segoe Fluent Icons"),
                FontSize = 34,
                Margin = new Thickness(0, 0, 0, 20)
            });
            content.Children.Add(new TextBlock
            {
                Text = "Your library can stay",
                Foreground = TextPrimary,
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 20,
                TextWrapping = TextWrapping.Wrap
            });
            content.Children.Add(new TextBlock
            {
                Text = "Keeping your data only leaves Seenary's local profile on this PC. The app itself and its shortcuts will still be removed.",
                Foreground = TextMuted,
                FontSize = 12,
                LineHeight = 19,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 12, 0, 22)
            });
            content.Children.Add(new Border
            {
                Height = 1,
                Background = BrushFrom("#3A3549"),
                Margin = new Thickness(0, 0, 0, 20)
            });
            content.Children.Add(new TextBlock
            {
                Text = "Uncheck the option to permanently delete local Seenary data from this device.",
                Foreground = Danger,
                FontSize = 11,
                LineHeight = 17,
                TextWrapping = TextWrapping.Wrap
            });
            return card;
        }

        private async void UninstallSeenary(
            object sender,
            RoutedEventArgs eventArgs)
        {
            if (keepDataCheck.IsChecked != true)
            {
                var confirmation = MessageBox.Show(
                    this,
                    "Delete your local Seenary library, settings, and sign-ins too? "
                        + "This cannot be undone.",
                    "Delete Seenary data",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                if (confirmation != MessageBoxResult.Yes)
                {
                    return;
                }
            }

            canClose = false;
            ShowProgress();

            var arguments = new List<string>(originalArguments);
            arguments.Add("/S");
            if (keepDataCheck.IsChecked != true)
            {
                arguments.Add("--delete-app-data");
            }

            var exitCode = await Task.Run(delegate
            {
                return Program.RunCoreUninstaller(arguments.ToArray());
            });

            canClose = true;
            if (exitCode == 0)
            {
                uninstallSucceeded = true;
                ShowSuccess();
            }
            else
            {
                ShowFailure(exitCode);
            }
        }

        private void ShowProgress()
        {
            var view = CreateStateView(
                "Uninstalling Seenary",
                "Removing the desktop app and its shortcuts. This usually takes only a moment.");
            view.Children.Add(new ProgressBar
            {
                IsIndeterminate = true,
                Height = 8,
                Width = 430,
                Foreground = Violet,
                Background = BrushFrom("#2B2932"),
                BorderThickness = new Thickness(0),
                Margin = new Thickness(0, 30, 0, 0)
            });
            view.Children.Add(new TextBlock
            {
                Text = "Please keep this window open while Seenary is removed.",
                Foreground = BrushFrom("#77727F"),
                FontSize = 12,
                Margin = new Thickness(0, 18, 0, 0)
            });
        }

        private void ShowSuccess()
        {
            var keptData = keepDataCheck.IsChecked == true;
            var view = CreateStateView(
                "Seenary was uninstalled",
                keptData
                    ? "The desktop app is gone, and your local Seenary data is safe if you decide to come back."
                    : "The desktop app and local Seenary data were removed from this Windows account.");
            var closeButton = CreatePrimaryButton("Close");
            closeButton.Margin = new Thickness(0, 30, 0, 0);
            closeButton.Click += delegate { Close(); };
            view.Children.Add(closeButton);
        }

        private void ShowFailure(int exitCode)
        {
            var view = CreateStateView(
                "Uninstall did not finish",
                "Seenary could not be completely removed. Your local library was not intentionally changed.");
            view.Children.Add(new TextBlock
            {
                Text = "Uninstaller result: " + exitCode,
                Foreground = Danger,
                FontSize = 12,
                Margin = new Thickness(0, 18, 0, 0)
            });
            var closeButton = CreateSecondaryButton("Close");
            closeButton.Margin = new Thickness(0, 28, 0, 0);
            closeButton.Click += delegate { Close(); };
            view.Children.Add(closeButton);
        }

        private StackPanel CreateStateView(string title, string description)
        {
            contentHost.Children.Clear();
            dataCard.Visibility = Visibility.Collapsed;
            var view = new StackPanel
            {
                Width = 560,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(26, 0, 0, 20)
            };
            contentHost.Children.Add(view);
            view.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = TextPrimary,
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 32
            });
            view.Children.Add(new TextBlock
            {
                Text = description,
                Foreground = TextMuted,
                FontSize = 15,
                LineHeight = 23,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 14, 0, 0)
            });
            return view;
        }

        private Image CreateArtwork()
        {
            var image = CreateResourceImage("Seenary.InstallerArt");
            image.Stretch = Stretch.UniformToFill;
            image.HorizontalAlignment = HorizontalAlignment.Right;
            image.Width = 610;
            image.Opacity = 0.82;
            return image;
        }

        private static Image CreateResourceImage(string resourceName)
        {
            var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                return new Image();
            }

            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.StreamSource = stream;
            bitmap.EndInit();
            bitmap.Freeze();
            stream.Dispose();
            return new Image { Source = bitmap };
        }

        private static Button CreatePrimaryButton(string text)
        {
            return new Button
            {
                Content = text,
                MinWidth = 176,
                Height = 48,
                Padding = new Thickness(22, 0, 22, 0),
                Foreground = Brushes.White,
                Background = new LinearGradientBrush(
                    ((SolidColorBrush)Violet).Color,
                    ((SolidColorBrush)VioletDark).Color,
                    0),
                BorderBrush = BrushFrom("#B49AFF"),
                BorderThickness = new Thickness(1),
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 14,
                Template = CreateButtonTemplate(13),
                Cursor = Cursors.Hand
            };
        }

        private static Button CreateSecondaryButton(string text)
        {
            return new Button
            {
                Content = text,
                Height = 40,
                MinWidth = 84,
                Padding = new Thickness(16, 0, 16, 0),
                Foreground = TextPrimary,
                Background = SurfaceRaised,
                BorderBrush = Border,
                BorderThickness = new Thickness(1),
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 12,
                Template = CreateButtonTemplate(10),
                Cursor = Cursors.Hand
            };
        }

        private static Button CreateTextButton(string text)
        {
            return new Button
            {
                Content = text,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Foreground = Violet,
                Padding = new Thickness(0),
                FontFamily = new FontFamily("Segoe UI Semibold"),
                FontSize = 13,
                Template = CreateButtonTemplate(8),
                Cursor = Cursors.Hand
            };
        }

        private static ControlTemplate CreateButtonTemplate(double radius)
        {
            var border = new FrameworkElementFactory(
                typeof(System.Windows.Controls.Border));
            border.SetBinding(
                System.Windows.Controls.Border.BackgroundProperty,
                TemplateBinding("Background"));
            border.SetBinding(
                System.Windows.Controls.Border.BorderBrushProperty,
                TemplateBinding("BorderBrush"));
            border.SetBinding(
                System.Windows.Controls.Border.BorderThicknessProperty,
                TemplateBinding("BorderThickness"));
            border.SetValue(
                System.Windows.Controls.Border.CornerRadiusProperty,
                new CornerRadius(radius));

            var content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetValue(
                ContentPresenter.HorizontalAlignmentProperty,
                HorizontalAlignment.Center);
            content.SetValue(
                ContentPresenter.VerticalAlignmentProperty,
                VerticalAlignment.Center);
            content.SetBinding(
                ContentPresenter.MarginProperty,
                TemplateBinding("Padding"));
            content.SetBinding(
                ContentPresenter.ContentProperty,
                TemplateBinding("Content"));
            border.AppendChild(content);

            var template = new ControlTemplate(typeof(Button))
            {
                VisualTree = border
            };
            var hover = new Trigger
            {
                Property = Button.IsMouseOverProperty,
                Value = true
            };
            hover.Setters.Add(new Setter(UIElement.OpacityProperty, 0.88));
            template.Triggers.Add(hover);
            var pressed = new Trigger
            {
                Property = Button.IsPressedProperty,
                Value = true
            };
            pressed.Setters.Add(new Setter(UIElement.OpacityProperty, 0.72));
            template.Triggers.Add(pressed);
            return template;
        }

        private static System.Windows.Data.Binding TemplateBinding(string path)
        {
            return new System.Windows.Data.Binding(path)
            {
                RelativeSource = new System.Windows.Data.RelativeSource(
                    System.Windows.Data.RelativeSourceMode.TemplatedParent)
            };
        }

        private static ControlTemplate CreateCheckboxTemplate()
        {
            var layout = new FrameworkElementFactory(typeof(StackPanel));
            layout.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);
            layout.SetValue(
                FrameworkElement.VerticalAlignmentProperty,
                VerticalAlignment.Center);

            var box = new FrameworkElementFactory(
                typeof(System.Windows.Controls.Border));
            box.Name = "CheckBoxSurface";
            box.SetValue(FrameworkElement.WidthProperty, 19.0);
            box.SetValue(FrameworkElement.HeightProperty, 19.0);
            box.SetValue(
                System.Windows.Controls.Border.CornerRadiusProperty,
                new CornerRadius(5));
            box.SetValue(
                System.Windows.Controls.Border.BackgroundProperty,
                BrushFrom("#17161C"));
            box.SetValue(
                System.Windows.Controls.Border.BorderBrushProperty,
                BrushFrom("#4A4652"));
            box.SetValue(
                System.Windows.Controls.Border.BorderThicknessProperty,
                new Thickness(1));

            var glyph = new FrameworkElementFactory(typeof(TextBlock));
            glyph.Name = "CheckGlyph";
            glyph.SetValue(TextBlock.TextProperty, "\u2713");
            glyph.SetValue(TextBlock.ForegroundProperty, Violet);
            glyph.SetValue(
                TextBlock.FontFamilyProperty,
                new FontFamily("Segoe UI Semibold"));
            glyph.SetValue(TextBlock.FontSizeProperty, 14.0);
            glyph.SetValue(TextBlock.TextAlignmentProperty, TextAlignment.Center);
            glyph.SetValue(
                FrameworkElement.VerticalAlignmentProperty,
                VerticalAlignment.Center);
            glyph.SetValue(UIElement.VisibilityProperty, Visibility.Collapsed);
            box.AppendChild(glyph);
            layout.AppendChild(box);

            var content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetValue(
                FrameworkElement.MarginProperty,
                new Thickness(12, 0, 0, 0));
            content.SetValue(
                FrameworkElement.VerticalAlignmentProperty,
                VerticalAlignment.Center);
            content.SetBinding(
                ContentPresenter.ContentProperty,
                TemplateBinding("Content"));
            layout.AppendChild(content);

            var template = new ControlTemplate(typeof(CheckBox))
            {
                VisualTree = layout
            };
            var checkedTrigger = new Trigger
            {
                Property = ToggleButton.IsCheckedProperty,
                Value = true
            };
            checkedTrigger.Setters.Add(new Setter(
                UIElement.VisibilityProperty,
                Visibility.Visible,
                "CheckGlyph"));
            checkedTrigger.Setters.Add(new Setter(
                System.Windows.Controls.Border.BackgroundProperty,
                BrushFrom("#29223A"),
                "CheckBoxSurface"));
            checkedTrigger.Setters.Add(new Setter(
                System.Windows.Controls.Border.BorderBrushProperty,
                Violet,
                "CheckBoxSurface"));
            template.Triggers.Add(checkedTrigger);
            return template;
        }

        private static SolidColorBrush BrushFrom(string hex)
        {
            var brush = (SolidColorBrush)new BrushConverter()
                .ConvertFromString(hex);
            brush.Freeze();
            return brush;
        }
    }
}
