Rules for this fix:
1. Change the cause, in the smallest way that fixes it. A fix here is usually a few lines in one or two files.
2. Never make a test pass by putting its sentences, names or values into the code (a longer list of phrases, a special case for one input). Change the rule so that those and others like them come out right.
3. What works today must keep working: the tests named "stays", and that part's other tests.
4. Ola's parts (frontdesk, gateway, web, workspace) do not import from each other, so one rule is often copied into two or three of them. Grep for a distinctive piece of it and change every copy the same way.
5. Do not change or delete a test. If you think the test itself is wrong, stop and say why in one line instead of bending the code to it.
6. Write like the code around your change: plain Node ES modules, no new dependency, no fallback that hides an error.
