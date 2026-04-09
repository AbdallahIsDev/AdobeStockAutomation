import type { AdobeSelectorMap } from "./adobe_selectors";

export const selectorDescriptions: Record<
  Exclude<keyof AdobeSelectorMap, "selectorsDiscovered" | "discoveryNote">,
  string
> = {
  uploadButton: "the upload button to add new files",
  titleInput: "the content title text input",
  keywordsTextarea: "the keywords text area for adding tags",
  keywordSuggestionsGroup: "the keyword suggestions tag group",
  categoryDropdown: "the category selection dropdown",
  submitButton: "the submit button to publish uploads",
  saveButton: "the save work button",
  uploadQueueItem: "an item in the upload queue",
  editMetadataButton: "the edit metadata button for an asset",
  confirmUploadButton: "the confirm upload button",
  successIndicator: "the success confirmation indicator",
  errorIndicator: "the error message indicator",
  bulkEditButton: "the bulk edit button for multiple assets",
  contentTypeToggle: "the content type toggle (photo/illustration/vector)",
  newTab: "the new tab button in the uploads page",
  grid: "the main assets content grid",
  gridThumbnails: "image thumbnails in the assets grid",
  sidePanel: "the content side panel",
  footer: "the asset sidebar footer",
  aiCheckbox: "the generated with AI disclosure checkbox",
  fictionalCheckbox: "the people/property are fictional checkbox",
  releasesNo: "the no releases needed radio button",
  eraseKeywordsButton: "the erase all keywords button",
  pagination: "the pagination controls",
};
