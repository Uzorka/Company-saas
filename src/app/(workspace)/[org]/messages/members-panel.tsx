"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Field, Select } from "@/components/ui/field";
import { addToChannel } from "@/lib/messages/actions";
import type { ConversationRow } from "@/lib/messages/queries";

/**
 * Who is in this channel, and adding someone.
 *
 * Any member can add another. A channel is discoverable by everyone in the
 * workspace anyway, so this saves a step rather than granting reach that was
 * otherwise unavailable — and the person can leave.
 *
 * There is no equivalent for a direct message, by construction: the database
 * refuses it, and this panel is never opened for one.
 */
export function MembersPanel({
  org,
  conversation,
  colleagues,
  open,
  onClose,
}: {
  org: string;
  conversation: ConversationRow;
  colleagues: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const outside = colleagues.filter(
    (person) => !conversation.memberIds.includes(person.id),
  );

  function add(formData: FormData) {
    setError(undefined);
    formData.set("org", org);
    formData.set("conversationId", conversation.id);
    startTransition(async () => {
      const result = await addToChannel({}, formData);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`People in ${conversation.title}`}
      subtitle="Everyone here can read the whole history, including what was said before they joined."
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-2">
          {conversation.memberNames.map((name, index) => (
            <li
              key={conversation.memberIds[index]}
              className="flex items-center gap-2.5 text-body"
            >
              <Avatar name={name} size="sm" />
              {name}
            </li>
          ))}
        </ul>

        {outside.length > 0 ? (
          <form action={add} className="flex flex-col gap-3 border-t border-border pt-4">
            <Field label="Add someone" htmlFor="userId" required>
              <Select id="userId" name="userId" required defaultValue="">
                <option value="">Choose a colleague</option>
                {outside.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <Button type="submit" loading={pending} className="self-start">
              Add to channel
            </Button>
          </form>
        ) : (
          <p className="border-t border-border pt-4 text-small text-text-2">
            Everyone with a sign-in account is already here.
          </p>
        )}
      </div>
    </SlideOver>
  );
}
