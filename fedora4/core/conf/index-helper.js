/*
  This is a basic skeleton JavaScript update processor.

  In order for this to be executed, it must be properly wired into solrconfig.xml; by default it is commented out in
  the example solrconfig.xml and must be uncommented to be enabled.

  See http://wiki.apache.org/solr/ScriptUpdateProcessor for more details.
*/

var PCDM_PREFIX = "http://pcdm.org/models#";
var PCDM_COLLECTION = "pcdm:Collection";
var PCDM_OBJECT = "pcdm:Object";
var PCDM_FILE = "pcdm:File";
var OA_ANNOTATION = "oa:Annotation";
var UMDACCESS_PUBLISHED = "umdaccess:Published";
var UMDACCESS_HIDDEN = "umdaccess:Hidden";
var UMD_TOP_LEVEL_PREFIX = "umd:";

var ONTOLOGY_MAPPING = {
  "http://fedora.info/definitions/v4/repository#": "fedora:",
  "http://pcdm.org/models#": "pcdm:",
  "http://www.w3.org/ns/auth/acl#": "acl:",
  "http://www.w3.org/ns/ldp#": "ldp:",
  "http://www.openarchives.org/ore/terms/": "ore:",
  "http://purl.org/ontology/bibo/": "bibo:",
  "http://chroniclingamerica.loc.gov/terms/": "ndnp:",
  "http://id.loc.gov/vocabulary/carriers/": "carriers:",
  "http://pcdm.org/use#": "pcdmuse:",
  "http://purl.org/spar/fabio/": "fabio:",
  "http://www.w3.org/ns/oa#": "oa:",
  "http://www.shared-canvas.org/ns/painting": "sc:",
  "http://vocab.lib.umd.edu/access#": "umdaccess:",
  "http://vocab.lib.umd.edu/model#": "umd:"
}

// shortened RDF type => component label
var TYPE_MAP = {
  "pcdm:Collection": "Collection",
  "bibo:Issue": "Issue",
  "bibo:Article": "Article",
  "ndnp:Page": "Page",
  "carriers:hd": "Reel",
  "bibo:Letter": "Letter",
  "bibo:Image": "Image",
  "fabio:Page": "Page",
  "fabio:ArchivalRecordSet": "Archival Record Set"
};

if (!String.prototype.includes) {
  String.prototype.includes = function() {'use strict';
    return String.prototype.indexOf.apply(this, arguments) !== -1;
  };
}

var COLLECTION = "Collection";
var NEWSPAPER_ISSUE = "Issue";

// LDPATH FIELDS
var RDF_FIELD = "rdf_type";
var TITLE_FIELD = "title";
var DATE_FIELD = "date";
var MEMBER_OF_FIELD = "pcdm_member_of";
var MEMBER_OF_PCDM_COLLECTION_FIELD = "member_of_pcdm_collection";
var MEMBER_OF_PCDM_OBJECT_FIELD = "member_of_pcdm_object";
var RELATED_OBJECT_OF_FIELD = "pcdm_related_object_of";
var PCDM_FILES_FIELD = "pcdm_files";
var ANNOTATION_SOURCE_FIELD = "annotation_source";
var ANNOTATION_TARGET_FIELD = "annotation_target";
var GENRE_FIELD = "genre";
var HANDLE_FIELD = "handle";

// SOLR FIELDS
var SOLR_OBJECT_TYPE = "object_type";
var SOLR_COMPONENT = "component";
var SOLR_PCDM_COLLECTION = "pcdm_collection";
var SOLR_DISPLAY_TITLE = "display_title";
var SOLR_ISSUE_TITLE_FACET = "issue_title_facet";
var SOLR_IS_PCDM = "is_pcdm";
var SOLR_DISPLAY_DATE = "display_date";
var SOLR_SORT_DATE = "sort_date";
var SOLR_DATE_DECADE = "date_decade";
var SOLR_DATE_YEAR = "date_year";
var SOLR_DATE_MONTH = "date_month";
var SOLR_EXTRACTED_TEXT_SOURCE = "extracted_text_source";
var SOLR_IS_PUBLISHED = "is_published";
var SOLR_IS_HIDDEN = "is_hidden";
var SOLR_IS_TOP_LEVEL = "is_top_level";
var SOLR_IS_DISCOVERABLE = "is_discoverable";

var MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function processAdd(cmd) {
  var doc = cmd.solrDoc;  // org.apache.solr.common.SolrInputDocument
  var id = doc.getFieldValue("id");
  logger.debug("update-script#processAdd: id=" + id);
  logger.debug("update-script#processAdd: keys=" + doc.keySet());

  shortenRDFType(doc);
  var pcdm_type = getPCDMType(doc);
  setIsPCDM(doc, pcdm_type);
  setPCDMCollection(doc);
  setObjectComponent(doc);
  setDisplayTitle(doc);
  removeNonSchemaFields(doc);
  parseDateField(doc);
  if (isAnnotation(doc)) {
    setExtractedTextSource(doc);
  }
  removeURIGenreValues(doc);
  removeHDLPrefix(doc);
  setPublicationAndDiscoveryStatusFields(doc);

  logger.debug("update-script#processAdd: updated keys=" + doc.keySet());
}

function processDelete(cmd) {
  // no-op
}

function processMergeIndexes(cmd) {
  // no-op
}

function processCommit(cmd) {
  // no-op
}

function processRollback(cmd) {
  // no-op
}

function finish() {
  // no-op
}

// Check if value exists for the given field in the doc
function hasValue(doc, field) {
  if (getValueArray(doc, field).length > 0) {
    return true;
  }
  return false;
}

// Get value if value exists for the given field in the doc
function getValueArray(doc, field) {
  var arr_val = [];
  if (doc.containsKey(field)) {
    var val = doc.getFieldValues(field);
    for (var i = 0; i < val.length; i++) {
      arr_val.push(val[i]);
    }
  }
  return arr_val;
}

// Set ontology namespace
function replaceURIWithNamespacePrefix(uri) {
  var uri_str = "" + uri;
  var keys = Object.keys(ONTOLOGY_MAPPING);
  for (var i=0; i < keys.length; i++) {
    var key = keys[i];
    if (uri_str.includes(key)) {
      uri_str = uri_str.replace(key, ONTOLOGY_MAPPING[key]);
      return uri_str;
    }
  }
  return uri_str;
}

// Reduce RDF URI to namespace prefixes Type based on rdf_type
function shortenRDFType(doc) {
  var rdf_types = getValueArray(doc, RDF_FIELD);
  doc.remove(RDF_FIELD);
  var short_type = "";
  for(var i=0; i < rdf_types.length; i++) {
    short_type = replaceURIWithNamespacePrefix(rdf_types[i]);
    doc.addField(RDF_FIELD, short_type);
  }
}

// Set PCDM Type based on rdf_type
function getPCDMType(doc) {
  var rdf_types = getValueArray(doc, RDF_FIELD);
  var pcdm_type = "";
  for(var i=0; i < rdf_types.length; i++) {
    if (rdf_types[i].includes(ONTOLOGY_MAPPING[PCDM_PREFIX])) {
      logger.debug('Found a PCDM type: ' + rdf_types[i]);
      pcdm_type = rdf_types[i];
      break;
    }
  }
  return pcdm_type;
}

// Set IS_PCDM field
function setIsPCDM(doc, pcdm_type) {
  if (pcdm_type != "") {
    logger.debug('Setting ' + SOLR_IS_PCDM + ' to "true"');
    doc.addField(SOLR_IS_PCDM, true);
  }
}

// Set Component Type based on rdf_type
function setObjectComponent(doc, pcdm_type) {
  var rdf_types = getValueArray(doc, RDF_FIELD);
  // even if the resource has a component already, if
  // it is a bibo:Letter, use the original TYPE_MAP;
  // see https://issues.umd.edu/browse/LIBFCREPO-994
  // and https://issues.umd.edu/browse/LIBHYDRA-421
  if (hasValue(doc, SOLR_COMPONENT) && rdf_types.indexOf('bibo:Letter') == -1) {
    logger.debug(SOLR_COMPONENT + ' field already set to "' + doc.getFieldValue(SOLR_COMPONENT) + '"; skipping rdf:type scan');
    return;
  }
  var component = "";
  for (var i = 0; i < rdf_types.length; i++) {
    var rdf_type = rdf_types[i];
    if (rdf_type in TYPE_MAP) {
      component = TYPE_MAP[rdf_type];
      break;
    }
  }
  if (component != "") {
    logger.debug('Setting ' + SOLR_COMPONENT + ' field to "' + component + '"');
    doc.setField(SOLR_COMPONENT, component);
  }
}

// Check member_of for collections and add those to collection field
function setPCDMCollection(doc) {
  var collections = getValueArray(doc, MEMBER_OF_PCDM_COLLECTION_FIELD);
  if (collections.length > 0) {
    doc.setField(SOLR_PCDM_COLLECTION, collections);
  }
}

// Create single valued title
function setDisplayTitle(doc) {
  var titles = [];
  var keys = doc.getFieldNames().toArray();
  // look through field keys for "title" or "title_[lang]" fields
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] == 'title' || keys[i].substr(0, 6) == 'title_') {
      titles = titles.concat(getValueArray(doc, keys[i]));
    }
  }
  var display_title = titles.sort().join(', ');
  doc.setField(SOLR_DISPLAY_TITLE, display_title);
}

// Remove fields that is only intended to be used in this helper script
// and should not be indexed to solr.
function removeNonSchemaFields(doc) {
  doc.remove(MEMBER_OF_PCDM_COLLECTION_FIELD);
  doc.remove(MEMBER_OF_PCDM_OBJECT_FIELD);
}

// Construct a decade string (e.g. 1970 - 1979) from year (e.g. 1976)
function getDecade(year) {
  var year_str = year + "";
  year_str = year_str.substr(0,3)
  return year_str + "0 - " + year_str + "9"
}

// Construct a sortable month string (e.g. 00::January) from date.
function getSortableMonthString(mm) {
  var month_number = parseInt(mm) - 1;
  return ("0" + month_number).slice(-2) + "::" + MONTHS[month_number];
}

// Parse EDTF date string and populate the date-related fields
function parseDateField(doc) {
  var date_array = getValueArray(doc, DATE_FIELD);
  if (date_array.length > 0) {
    // display date is the value straight from the repo
    var display_date = date_array[0];
    // remove the date field from solr indexing and return if it is blank
    if (display_date == '') {
      doc.remove(DATE_FIELD);
      return;
    }
    // remove "[", "]", and "../" or "/.." from before/after dates
    // then take only the first date in a comma-delimited range
    var sort_date = display_date
      .replace(/[\[\]]/g, '')
      .replace(/^\.\.|\.\.$/, '')
      .replace(/^[/]|[/]$/, '')
      .replace(/,.*/, '');
    // strip approximation and uncertainty markers,
    // replace any unspecified digits with the smallest replacement,
    // then look for YYYY[-MM[-DD]] ISO date and extract it
    var matches = sort_date
      .replace(/[~?%]/g, '')
      .replace(/-[0X]X/g, '-01')
      .replace(/-([123])X/g, '-$10')
      .replace(/^(\d\d\d)X/, '$10')
      .replace(/^(\d\d)XX/, '$100')
      .replace(/^(\d)XXX/, '$1000')
      .match(/^(\d\d\d\d)(?:-(\d\d)(?:-(\d\d))?)?/);
    var yyyy = matches[1];
    // default to '01' for month and day
    var mm = matches[2] || '01';
    var dd = matches[3] || '01';

    // check for EDTF pseudo-months outside of the normal 1-12 range
    var mm_number = parseInt(mm);
    if (mm_number >= 21 && mm_number <= 24) {
      // these are "season" pseudo-months
      // rewrite to align with the first day of the month traditionally
      // associated with the start of that season
      // mapping:
      // 21 (Spring) --> 03 (March)
      // 22 (Summer) --> 06 (June)
      // 23 (Autumn) --> 09 (September)
      // 24 (Winter) --> 12 (December)
      var calendar_month = (mm_number - 20) * 3;
      mm = ('00' + calendar_month).slice(-2);
    }
    var iso_date = yyyy + '-' + mm + '-' + dd + 'T00:00:00Z';
    doc.setField(DATE_FIELD, iso_date);
    doc.setField(SOLR_DISPLAY_DATE, display_date);
    doc.setField(SOLR_SORT_DATE, sort_date);
    if (mm) {
      doc.setField(SOLR_DATE_MONTH, getSortableMonthString(mm));
    }
    var year = parseInt(yyyy);
    doc.setField(SOLR_DATE_YEAR, year);
    doc.setField(SOLR_DATE_DECADE, getDecade(year));
  } else {
    doc.setField(SOLR_DATE_DECADE, "Unknown");
  }
}

function isAnnotation(doc) {
  var rdf_types = getValueArray(doc, RDF_FIELD);
  for (var i = 0; i < rdf_types.length; i++) {
    if (rdf_types[i] == OA_ANNOTATION) {
      return true;
    }
  }
  return false;
}

// Create a single-valued extracted text source field,
// for grouping multiple OCR textblock results from the
// same source into single hits.
function setExtractedTextSource(doc) {
  var extracted_text_source = "";
  var sources = getValueArray(doc, ANNOTATION_SOURCE_FIELD);
  if (sources.length > 0) {
    extracted_text_source = sources[0];
  } else {
    // try the annotation target field
    var targets = getValueArray(doc, ANNOTATION_TARGET_FIELD);
    if (targets.length > 0) {
      extracted_text_source = targets[0];
    }
  }
  doc.setField(SOLR_EXTRACTED_TEXT_SOURCE, extracted_text_source);
}

// Remove Genre values that look like URIs
// See https://issues.umd.edu/browse/LIBWEB-4748
function removeURIGenreValues(doc) {
  var genre = getValueArray(doc, GENRE_FIELD);
  doc.remove(GENRE_FIELD);
  // look for non-URI values
  for (var i = 0; i < genre.length; i++) {
    if (!(genre[i].startsWith('http://') || genre[i].startsWith('https://'))) {
      doc.addField(GENRE_FIELD, genre[i]);
    }
  }
}

// remove the "hdl:" URI prefix from the handle field value
function removeHDLPrefix(doc) {
  if (hasValue(doc, HANDLE_FIELD)) {
    var handle = doc.getFieldValue(HANDLE_FIELD);
    doc.setField(HANDLE_FIELD, handle.replace(/^hdl:/, ""));
  }
}

function setPublicationAndDiscoveryStatusFields(doc) {
  var is_published = false;
  var is_hidden = false;
  var is_top_level = false;

  var rdf_types = getValueArray(doc, RDF_FIELD);
  for (var i = 0; i < rdf_types.length; i++) {
    if (rdf_types[i] == UMDACCESS_PUBLISHED) {
      is_published = true;
    }
    if (rdf_types[i] == UMDACCESS_HIDDEN) {
      is_hidden = true;
    }
    if (rdf_types[i].startsWith(UMD_TOP_LEVEL_PREFIX)) {
      is_top_level = true;
    }
  }
  doc.setField(SOLR_IS_PUBLISHED, is_published);
  doc.setField(SOLR_IS_HIDDEN, is_hidden);
  doc.setField(SOLR_IS_TOP_LEVEL, is_top_level);

  var is_discoverable = is_top_level && is_published && !is_hidden;
  doc.setField(SOLR_IS_DISCOVERABLE, is_discoverable);
}
