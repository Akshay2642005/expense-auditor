import { useTheme } from "@/hooks/useTheme";

export function ClerkCaptcha() {
  const { resolved } = useTheme();

  return (
    <div
      id="clerk-captcha"
      data-cl-theme={resolved}
      data-cl-size="flexible"
      className="overflow-hidden rounded-md"
    />
  );
}
