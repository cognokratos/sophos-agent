<script lang="ts">
	import type { TraceNote } from '$lib/chat';

	const { traceNotes } = $props<{ traceNotes: TraceNote[] }>();
</script>

<div class="border-t border-gray-700 bg-gray-800 p-4">
	<details>
		<summary class="cursor-pointer font-bold" data-testid="reasoning-summary"
			>Reasoning Trace</summary
		>
		<div class="mt-2 space-y-1 text-sm text-gray-400" data-testid="reasoning-trace">
			{#each traceNotes as note, i (`note_${i}`)}
				<div>
					<span class="rounded bg-gray-700 px-1 py-0.5 font-mono text-xs"
						>{note.event.toUpperCase()}</span
					>
					<span class="ml-2 font-semibold">{note.node}: {note.name}</span>
				</div>
			{/each}
		</div>
	</details>
</div>
