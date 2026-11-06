-- the right document's URL is known but its text couldn't be downloaded (bot wall, JS-only page)
alter type find_status add value if not exists 'linked' after 'found';
