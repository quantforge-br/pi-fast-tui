// Nested calls a codemode script is running now, with the last line of their output; codemode records neither.

export interface LiveCall {
	name: string;
	args: unknown;
	startedAt: number;
	/** Last line of output so far. */
	tail?: string;
}

export class LiveCalls {
	private readonly parents = new Map<string, Map<string, LiveCall>>();

	start(parentId: string, id: string, name: string, args?: unknown): void {
		let calls = this.parents.get(parentId);
		if (!calls) {
			calls = new Map();
			this.parents.set(parentId, calls);
		}
		calls.set(id, { name, args, startedAt: Date.now() });
	}

	update(parentId: string, id: string, tail: string | undefined): void {
		const call = this.parents.get(parentId)?.get(id);
		if (call && tail) call.tail = tail;
	}

	end(parentId: string, id: string): LiveCall | undefined {
		const calls = this.parents.get(parentId);
		const call = calls?.get(id);
		calls?.delete(id);
		return call;
	}

	/** Forget a script, including calls it left running. */
	clear(parentId: string): void {
		this.parents.delete(parentId);
	}

	/** Running calls of a script in the order they started. */
	list(parentId: string): LiveCall[] {
		return [...(this.parents.get(parentId)?.values() ?? [])];
	}
}
