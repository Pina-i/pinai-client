import type { TextMatch } from "@pinai/domain/models/conversation-search"

/** `text`, with the stretch a search matched marked. */
export function Highlight({ text, match }: { text: string; match: TextMatch | null }) {
    if (!match) return text
    return (
        <>
            {text.slice(0, match.start)}
            <mark className="bg-transparent font-semibold text-acc underline decoration-acc-line decoration-[1.5px] underline-offset-[3px]">
                {text.slice(match.start, match.end)}
            </mark>
            {text.slice(match.end)}
        </>
    )
}
