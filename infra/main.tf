resource "random_string" "suffix" {
  length  = 8
  upper   = false
  special = false
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_storage_account" "site" {
  name                     = "${var.storage_account_prefix}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_account_static_website" "site" {
  storage_account_id = azurerm_storage_account.site.id
  index_document     = "index.html"
  error_404_document = "index.html"
}

locals {
  project_root = abspath("${path.module}/..")
  site_files = concat(
    ["index.html", "style.css", "game.js"],
    [for file in fileset(local.project_root, "assets/*") : file]
  )

  content_types = {
    html = "text/html"
    css  = "text/css"
    js   = "application/javascript"
    png  = "image/png"
    jpg  = "image/jpeg"
    jpeg = "image/jpeg"
    webp = "image/webp"
    svg  = "image/svg+xml"
    gif  = "image/gif"
  }
}

resource "azurerm_storage_blob" "site_files" {
  for_each = { for file in local.site_files : file => file }

  name                   = each.value
  storage_container_id   = "${azurerm_storage_account.site.id}/blobServices/default/containers/$web"
  type                   = "Block"
  source                 = "${local.project_root}/${each.value}"
  content_md5            = filemd5("${local.project_root}/${each.value}")
  content_type = lookup(
    local.content_types,
    lower(regex("[^.]+$", each.value)),
    "application/octet-stream"
  )
}
