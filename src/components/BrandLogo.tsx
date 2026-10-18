/** Match the app's explicit .dark theme, not an unrelated OS preference. */
export function BrandLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <span className="inline-block" aria-hidden="true">
      <img
        src="/brand/wordmark.svg"
        alt=""
        width="289"
        height="64"
        className={`${className} dark:hidden`}
      />
      <img
        src="/brand/wordmark-on-dark.svg"
        alt=""
        width="289"
        height="64"
        className={`${className} hidden dark:block`}
      />
    </span>
  );
}
