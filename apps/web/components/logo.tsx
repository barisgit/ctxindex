import Image from 'next/image'

export function Logo({
  size = 24,
  priority = false,
}: {
  size?: number
  priority?: boolean
}) {
  return (
    <>
      <Image
        src="/logo.png"
        alt="ctxindex logo"
        width={size}
        height={size}
        priority={priority}
        className="dark:hidden"
      />
      <Image
        src="/logo-dark.png"
        alt="ctxindex logo"
        width={size}
        height={size}
        priority={priority}
        className="hidden dark:block"
      />
    </>
  )
}
