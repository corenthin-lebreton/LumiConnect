import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center rounded-md",
    "border border-transparent font-medium whitespace-nowrap select-none outline-none",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out",
    "active:scale-[0.985] motion-reduce:active:scale-100",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-106",
        outline: "border-line-strong bg-card text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-106",
        "destructive-outline":
          "border-line-strong bg-card text-destructive hover:bg-destructive/10",
        "destructive-ghost":
          "bg-transparent text-muted-foreground hover:bg-destructive/12 hover:text-destructive",
        link:
          "bg-transparent text-foreground underline underline-offset-4 decoration-line-strong " +
          "hover:decoration-foreground active:scale-100",
      },
      size: {
        default: "h-[34px] gap-2 px-3.5 text-[0.84375rem]",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-2 px-2.5 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-[15px]",
        lg: "h-[38px] gap-2 px-4 text-sm",
        xl: "h-[46px] gap-2 rounded-lg px-4 text-[0.90625rem]",
        icon: "size-[34px]",
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
