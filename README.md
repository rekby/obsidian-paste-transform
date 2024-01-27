# Paste transform plugin

This is a Paste transform plugin for Obsidian (https://obsidian.md).

The plugin handle paste event, check if pasted simple text, then handle pasted textx by regexps.

# Usage 
Simple paste text/link from clipboard. For example try to copy and paste link for [example issue](https://github.com/rekby/obsidian-paste-transform/issues/1)
and paste them to a page.
![paste-example.png](attachements/paste-example.png)


# Settings
![settings-page.png](attachements%2Fsettings-page.png)

## Transform rules
Contains two text areas. Left - for regexp patterns and right - for replace rules.

Write match regexp expression to the left area. One regexp for a line.
You can read more about regexp at [javascript documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions).

And write a replacement rule to the right area at same line as the rule.
You can read more about replacement string at [javascript documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement).

The plugin contains some default rules for GitHub and Wikipedia as example. 

## Try result
You can write test text into "Try source" text area and see result in "Try destination".
If you make a mistake in regexp - error will output to "Try destination"

## Resize text area
Text areas can be small by default. You can resize them by drag at right down corner.

