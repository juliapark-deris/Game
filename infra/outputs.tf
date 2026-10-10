output "static_website_url" {
  description = "URL of the deployed static website."
  value       = azurerm_storage_account.site.primary_web_endpoint
}

output "storage_account_name" {
  description = "Created storage account name."
  value       = azurerm_storage_account.site.name
}
