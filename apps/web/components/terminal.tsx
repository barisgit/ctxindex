export function Terminal() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 text-left shadow-2xl shadow-black/40"
      style={{ backgroundColor: 'hsl(220 14% 5%)' }}
    >
      <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="ml-3 font-mono text-xs text-white/30">
          agent session
        </span>
      </div>
      <div className="space-y-1 overflow-x-auto p-5 font-mono text-xs leading-relaxed sm:text-[13px]">
        <p className="whitespace-nowrap">
          <span className="text-amber-400/80">$</span>{' '}
          <span className="text-white">
            ctxindex search "flight to berlin" --realm personal --json
          </span>
        </p>
        <p className="whitespace-nowrap text-white/50">
          {'{'}"results":[{'{'}"ref":
          "ctx://01J00000000000000000000000/message/stable-message-id",
          "profile":{'{'}"id":"communication.message","version":1{'}'},
          "sourceId":"01J00000000000000000000000","origin":"remote",
          "originRank":0,"title":"Flight to Berlin","summary":null,
          "occurredAt":1784379171762,"chunks":[]{'}'}],"warnings":[]{'}'}
        </p>
        <p className="whitespace-nowrap pt-2">
          <span className="text-amber-400/80">$</span>{' '}
          <span className="text-white">
            ctxindex thread get
            'ctx://01J00000000000000000000000/message/stable-message-id' --json
          </span>
        </p>
        <p className="whitespace-nowrap text-white/50">
          {'{'}"mode":"tree","messages":[{'{'}"resource":{'{'}"ref":
          "ctx://01J00000000000000000000000/message/stable-message-id"{'}'},
          "children":[]{'}'}],"warnings":[]{'}'}
        </p>
        <p className="whitespace-nowrap pt-2">
          <span className="text-amber-400/80">$</span>{' '}
          <span className="ctx-cursor text-amber-400">▊</span>
        </p>
      </div>
    </div>
  )
}
