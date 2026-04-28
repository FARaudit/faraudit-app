import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light";
  className?: string;
}

const SIZES: Record<NonNullable<LogoProps["size"]>, { w: number; h: number }> = {
  sm: { w: 110, h: 28 },
  md: { w: 160, h: 40 },
  lg: { w: 200, h: 50 }
};

export default function Logo({ size = "md", variant = "dark", className = "" }: LogoProps) {
  const dim = SIZES[size];
  const src = variant === "light" ? "/logo-light.svg" : "/logo.svg";
  return (
    <Image
      src={src}
      alt="FARaudit"
      width={dim.w}
      height={dim.h}
      className={className}
      priority
    />
  );
}
