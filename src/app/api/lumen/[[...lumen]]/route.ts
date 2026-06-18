import { createLumenHandler } from "@payglocal_ui/lumen/next";

export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
  // referenceDirs: ["../sibling-repo"],  // read-only reference checkouts
  // secretPatterns: [/my_certs/i],       // extra patterns beyond built-in defaults
});
