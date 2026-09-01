import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center rounded-md",
    "border border-transparent font-medium whitespace-nowrap select-none outline-none",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out",
    "active:scale-[0.985] motion-reduce:active:scale-100",
    "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/88",
        outline:
          "border-line-strong bg-card text-foreground hover:bg-muted hover:border-line-strong",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/88",
        link: "bg-transparent text-foreground underline underline-offset-4 decoration-line-strong hover:decoration-foreground active:scale-100",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5 text-sm",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4.5 text-sm",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
