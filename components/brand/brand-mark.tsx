import Image from "next/image";

/** The supplied SCAMurai artwork, shared by every product wordmark. */
export function BrandMark({
  className = "",
  priority = false,
  sizes = "(max-width: 700px) 64px, 96px",
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <span className={`brand-asset ${className}`} aria-hidden="true">
      <Image
        src="/brand/scamurai-logo.png"
        alt=""
        width={240}
        height={240}
        sizes={sizes}
        preload={priority}
      />
    </span>
  );
}
