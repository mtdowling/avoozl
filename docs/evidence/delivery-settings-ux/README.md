# Settings > Delivery review

Shots of Settings > Delivery in the full app shell on fake data, at 1280 px
and 390 px, light and dark, before and after the change. Screenshots checked,
not kept in git. Make them again with:

    AVOOZL_CHROME=<chrome> AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/delivery-settings-ux-shots.mjs <out> delivery

The before fixture held `delivery.ship: "avoozl"`, a value Avoozl does not
accept, so no Who merges choice showed as picked. The fixture now holds
`ship: "manual"` and `feedbackRounds: 3`, so the after shots show a picked
choice and a Reset to default link.
