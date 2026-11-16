data.json has our projects (country, project, beneficiaries). Make index.html that reads data.json when the page loads (with fetch, so the page stays right when we update the file) and has:

- a dropdown, <select id="country">, with an option "all" plus one option per country (the option's value is the country name)
- an element with id="count" showing how many projects match the selected country
- an element with id="beneficiaries" showing the total beneficiaries of those projects

Changing the dropdown updates the numbers. No outside libraries; it must work offline.
