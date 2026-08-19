import { z } from "zod";

export const resolveSuggestionChoicesSchema = z.object({
  selections: z.array(
    z.object({
      slotId: z.string().min(1),
      optionId: z.string().min(1),
    }),
  ),
});

export type ResolveSuggestionChoicesInput = z.infer<
  typeof resolveSuggestionChoicesSchema
>;
