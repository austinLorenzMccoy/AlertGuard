import Image from "next/image";

/** Intrinsic aspect ratio of public/brand/logo-mark.png (514×556). */
const ASPECT_RATIO = 514 / 556;

export interface LogoMarkProps {
  /** Rendered height in pixels; width is derived from the mark's aspect ratio. */
  size?: number;
  className?: string;
  /** Skip lazy-loading for above-the-fold placements (e.g. the nav bar). */
  priority?: boolean;
}

/**
 * The AlertGuard shield/eye mark, cropped from the brand logo. `alt=""`
 * (decorative) because every call site pairs it with adjacent visible
 * "AlertGuard" text — an alt text here would just duplicate that in the
 * accessible name.
 */
export function LogoMark({ size = 32, className, priority = false }: LogoMarkProps) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt=""
      width={Math.round(size * ASPECT_RATIO)}
      height={size}
      className={className}
      priority={priority}
    />
  );
}
