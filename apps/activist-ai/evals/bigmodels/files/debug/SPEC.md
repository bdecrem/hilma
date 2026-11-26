# formula.mjs: the calculation engine of a small spreadsheet

`formula.mjs` is a JavaScript ES module that exports `function computeSheet(cells)`.

`cells` is an object that maps cell names such as "A1" to the raw string the person typed. Return an object with the same keys, each mapped to the value the cell shows.

- A raw string that is a number shows as a number. A raw string that starts with "=" is a formula. Anything else is text and shows as typed.
- Formulas: numbers, + - * / with the usual precedence and left-to-right order, unary minus, parentheses, cell references (case does not matter; columns A to Z, rows 1 to 99), and the functions SUM, AVERAGE, MIN, MAX, COUNT (case does not matter). A function takes arguments separated by commas; an argument is a range such as A1:B3 or any expression.
- A range is allowed only as a function argument. A range anywhere else is "#ERR!".
- A referenced cell that is empty or missing counts as 0 in arithmetic and is skipped by the functions. Text cells inside a range are skipped. A text cell referenced directly in arithmetic gives "#VALUE!".
- Errors, as strings: "#LOOP!" for a circular reference (for every cell on the cycle and every cell that depends on one), "#DIV/0!" for division by zero, "#ERR!" for a formula that cannot be parsed, "#NAME?" for an unknown function. A formula that refers to a cell showing an error shows that same error.
- Numeric results are JavaScript numbers. No libraries.
