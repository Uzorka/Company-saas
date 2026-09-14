import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merging, taught this project's type scale.
 *
 * tailwind-merge resolves conflicts by grouping class names, and it has to
 * guess which group an unfamiliar `text-*` belongs to. This theme names its
 * font sizes `text-body`, `text-small`, `text-h1` and so on — so
 * `text-body` was being read as a text *colour*, which put it in the same
 * group as `text-white` and dropped whichever came first.
 *
 * The effect: every primary and destructive button in the product rendered its
 * label in the inherited body colour instead of white — near-black on dark
 * blue, 2.12:1, well under the 4.5:1 minimum. It was found by running axe
 * against the sign-in page; no amount of typechecking or linting would have
 * shown it, and the class was right there in the source the whole time.
 *
 * Registering the scale as font sizes fixes the grouping. Any new size token
 * added to `@theme` belongs in this list too.
 */
const TYPE_SCALE = [
  "display",
  "h1",
  "h2",
  "h3",
  "body",
  "small",
  "overline",
  "data",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_SCALE] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
